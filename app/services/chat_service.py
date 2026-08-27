"""Multi-turn conversation orchestration.

Owns everything about a chat session — creation, entity scoping, transcript
storage, and the history window — and delegates the actual answering to
:mod:`app.agent.support_agent` so there is exactly one RAG pipeline in the
codebase.
"""

from __future__ import annotations

from app.agent.support_agent import answer_conversational
from app.config.demo_users import DemoUser
from app.errors import SessionEntityMismatchError
from app.models.chat import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    EntityType,
    ToolUse,
)
from app.services.access_control import authenticate, authorise_entity_access
from app.services.session_store import (
    ChatSession,
    InMemorySessionStore,
    SessionStore,
)
from app.tools import escalation


#: How many prior turns are replayed into the prompt. Ten exchanges is enough
#: for an agent to work a ticket without the prompt growing without bound.
MAX_HISTORY_MESSAGES = 20


#: Appended to the prompt when the turn is preparing an escalation. The model
#: investigates and justifies the action; it must not report it as done, because
#: at this point nothing has been created.
_ESCALATION_PREPARATION_GUIDANCE = """
STATE-CHANGING ACTION REQUESTED — PREPARATION ONLY
The support agent has asked to escalate this record. The escalation has NOT been
created yet and you must not imply that it has.

For this turn:
- Investigate the record above and state what is actually wrong.
- Apply the relevant policy, agreement, or SOP, naming the source you followed.
- Where the question turns on timing, work out the applicable response target
  and say plainly whether it is already breached, using the timestamps in the
  record. If a timestamp needed for that calculation is missing, say which one.
- State clearly whether escalation is appropriate, and why.
- If the data does not support escalation, or the decision needs human judgment
  the documents do not cover, say so and recommend what to verify first.
- End by asking the support agent to confirm before the escalation is created.

Do not use the words "escalation created" or any past-tense phrasing that
suggests the action has already happened.
"""


_store: SessionStore = InMemorySessionStore()


def get_session_store() -> SessionStore:
    """Return the active session store."""

    return _store


def set_session_store(store: SessionStore) -> None:
    """Swap the session store — for tests, or for a Redis/database backend."""

    global _store
    _store = store


def _history_window(messages: list[ChatMessage]) -> list[ChatMessage]:
    """Return the most recent turns, starting on a user message.

    Trimming can cut between a question and its answer; dropping a leading
    assistant reply keeps the transcript readable rather than opening on a reply
    to a question the model can no longer see.
    """

    window = messages[-MAX_HISTORY_MESSAGES:]
    first_user = next(
        (index for index, turn in enumerate(window) if turn.role == "user"),
        len(window),
    )

    return window[first_user:]


def _load_session(
    session_id: str,
    entity_type: EntityType,
    entity_id: str,
) -> ChatSession | None:
    """Fetch a session and confirm it belongs to this record.

    Raises:
        SessionEntityMismatchError: the session is bound to a different record,
            which would otherwise leak one ticket's history into another's
            prompt.
    """

    session = _store.get(session_id)

    if session is None:
        return None

    if not session.matches(entity_type, entity_id):
        raise SessionEntityMismatchError(
            session_id,
            expected=(session.entity_type, session.entity_id),
            received=(entity_type, entity_id),
        )

    return session


def _escalation_tool(detail: str) -> ToolUse:
    """Tool-activity record for the state-changing action."""

    return ToolUse(
        name="escalation_action",
        label="Escalation Action",
        icon="🚨",
        detail=detail,
    )


def _confirmed_escalation_turn(
    session: ChatSession,
    pending: escalation.PendingEscalation,
    message: str,
    user: DemoUser,
) -> ChatResponse:
    """Execute a confirmed escalation and record the turn.

    Reached only when :func:`escalation.get_pending_escalation` already returned
    an intent for this session, so the action cannot run without a preceding
    preparation turn in the same conversation. The tool re-verifies the user's
    scope before mutating anything.
    """

    record = escalation.execute_escalation(pending, user)

    answer = (
        f"**Escalation created — `{record.escalation_id}`**\n\n"
        f"- Escalation ID: `{record.escalation_id}`\n"
        f"- {record.entity_type.capitalize()}: `{record.entity_id}`\n"
        f"- Account: `{record.account_id or 'unknown'}`\n"
        f"- Status: `{record.status}`\n"
        f"- Created at: `{record.created_at.isoformat()}`\n\n"
        "The escalation is now on record. No further confirmation is needed."
    )

    session.add_message("user", message)
    session.add_message("assistant", answer)
    _store.save(session)

    return ChatResponse(
        session_id=session.session_id,
        entity_type=session.entity_type,
        entity_id=session.entity_id,
        answer=answer,
        tools_used=[
            _escalation_tool(
                f"Created {record.escalation_id} for {record.entity_id}"
            )
        ],
        action_result=record.as_dict(),
    )


def _withdrawn_escalation_turn(
    session: ChatSession,
    pending: escalation.PendingEscalation,
    message: str,
) -> ChatResponse:
    """Discard a prepared escalation the agent declined to confirm."""

    escalation.discard_pending_escalation(session.session_id)

    answer = (
        f"Understood — no escalation was created for `{pending.entity_id}`. "
        "The prepared action has been discarded. Ask again if you want it back."
    )

    session.add_message("user", message)
    session.add_message("assistant", answer)
    _store.save(session)

    return ChatResponse(
        session_id=session.session_id,
        entity_type=session.entity_type,
        entity_id=session.entity_id,
        answer=answer,
        tools_used=[
            _escalation_tool(f"Discarded prepared escalation for {pending.entity_id}")
        ],
    )


def send_message(
    request: ChatRequest,
    user_id: str | None = None,
) -> ChatResponse:
    """Answer one conversational turn and record it in the session.

    ``user_id`` is the ``X-User-ID`` header. The caller's role and account scope
    are looked up server-side in :mod:`app.config.demo_users`; nothing about
    their permissions comes from the request. The record's owning account is
    resolved from the database and checked against that scope *before* protected
    context is loaded, before vector retrieval, and before generation — so an
    unauthorised request reads no row, retrieves nothing, and spends no tokens.
    A caller naming another customer's ticket id is refused for exactly that
    reason.

    A state-changing action never executes on the turn that requests it: an
    escalation request is investigated and prepared, and only an explicit
    confirmation in the same session creates it.

    The session is only written after the model succeeds, so an unknown entity
    id or a failed generation leaves no empty conversation behind.

    Raises:
        UnknownUserError: the header names a user that does not exist.
        EntityNotFoundError: the ticket or order id does not exist.
        AccountAccessDeniedError: the record is outside the caller's scope.
        SessionEntityMismatchError: the session belongs to a different record.
    """

    # Who is calling, per the server-side directory — not per the request.
    user = authenticate(user_id)

    # Authorisation next: before the session lookup, before protected context is
    # loaded, before retrieval, before the model. 404 for an unknown id, 403 for
    # a record outside this user's scope.
    owner_account_id = authorise_entity_access(
        request.entity_type,
        request.entity_id,
        user,
    )

    session = (
        _load_session(request.session_id, request.entity_type, request.entity_id)
        if request.session_id
        else None
    )

    # A prepared action can only be completed from the session that prepared it.
    pending = (
        escalation.get_pending_escalation(session.session_id)
        if session is not None
        else None
    )

    if pending is not None:
        if escalation.is_rejection(request.message):
            return _withdrawn_escalation_turn(session, pending, request.message)

        if escalation.is_confirmation(request.message):
            return _confirmed_escalation_turn(
                session, pending, request.message, user
            )

    # An escalation request only ever *prepares* the action on this turn.
    is_escalation_request = pending is None and escalation.is_escalation_request(
        request.message
    )

    history = _history_window(session.messages) if session else []
    tools_used: list[ToolUse] = []

    answer = answer_conversational(
        entity_type=request.entity_type,
        entity_id=request.entity_id,
        message=request.message,
        history=history,
        action_guidance=(
            _ESCALATION_PREPARATION_GUIDANCE if is_escalation_request else None
        ),
        tools_used=tools_used,
        user=user,
    )

    if session is None:
        # Re-check: a concurrent first turn on a client-supplied id may have
        # created the session while this one was waiting on the model.
        session = (
            _load_session(
                request.session_id, request.entity_type, request.entity_id
            )
            if request.session_id
            else None
        )

    if session is None:
        session = _store.create(
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            session_id=request.session_id,
        )

    pending_action = None

    if is_escalation_request:
        prepared = escalation.prepare_escalation(
            session_id=session.session_id,
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            account_id=owner_account_id,
            reason=request.message,
            user=user,
        )
        pending_action = prepared.as_dict()

        answer = (
            f"{answer}\n\n---\n\n"
            f"⚠️ **Escalation prepared — confirmation required.** Nothing has "
            f"been created yet. Reply **\"yes, confirm\"** to escalate "
            f"`{request.entity_id}`, or **\"no\"** to discard it."
        )

        tools_used.append(
            _escalation_tool(
                f"Prepared escalation for {request.entity_id} — awaiting confirmation"
            )
        )

    session.add_message("user", request.message)
    session.add_message("assistant", answer)
    _store.save(session)

    return ChatResponse(
        session_id=session.session_id,
        entity_type=session.entity_type,
        entity_id=session.entity_id,
        answer=answer,
        tools_used=tools_used,
        pending_action=pending_action,
    )
