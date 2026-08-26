"""Multi-turn conversation orchestration.

Owns everything about a chat session — creation, entity scoping, transcript
storage, and the history window — and delegates the actual answering to
:mod:`app.agent.support_agent` so there is exactly one RAG pipeline in the
codebase.
"""

from __future__ import annotations

from app.agent.support_agent import answer_conversational
from app.errors import SessionEntityMismatchError
from app.models.chat import ChatMessage, ChatRequest, ChatResponse, EntityType
from app.services.session_store import (
    ChatSession,
    InMemorySessionStore,
    SessionStore,
)


#: How many prior turns are replayed into the prompt. Ten exchanges is enough
#: for an agent to work a ticket without the prompt growing without bound.
MAX_HISTORY_MESSAGES = 20


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


def send_message(request: ChatRequest) -> ChatResponse:
    """Answer one conversational turn and record it in the session.

    The session is only written after the model succeeds, so an unknown entity
    id or a failed generation leaves no empty conversation behind.

    Raises:
        EntityNotFoundError: the ticket or order id does not exist.
        SessionEntityMismatchError: the session belongs to a different record.
    """

    session = (
        _load_session(request.session_id, request.entity_type, request.entity_id)
        if request.session_id
        else None
    )

    history = _history_window(session.messages) if session else []

    answer = answer_conversational(
        entity_type=request.entity_type,
        entity_id=request.entity_id,
        message=request.message,
        history=history,
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

    session.add_message("user", request.message)
    session.add_message("assistant", answer)
    _store.save(session)

    return ChatResponse(
        session_id=session.session_id,
        entity_type=session.entity_type,
        entity_id=session.entity_id,
        answer=answer,
    )
