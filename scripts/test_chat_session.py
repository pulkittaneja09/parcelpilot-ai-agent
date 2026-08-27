"""Session-logic tests for the multi-turn chat service.

Deterministic and offline: the Claude call is stubbed out, so this verifies the
parts that must be correct regardless of what the model says — session creation,
entity scoping, history windowing, and error mapping.

Run with:
    python -m scripts.test_chat_session
"""

from app.errors import EntityNotFoundError, SessionEntityMismatchError
from app.models.chat import ChatMessage, ChatRequest
from app.services import chat_service
from app.services.session_store import InMemorySessionStore


failures: list[str] = []
passed = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed

    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failures.append(f"{name}{f' — {detail}' if detail else ''}")
        print(f"  FAIL  {name}{f' — {detail}' if detail else ''}")


#: Access control resolves role and scope from the X-User-ID header. manager_1
#: has full account scope, so these session-logic checks exercise scoping of
#: *conversations* rather than of accounts.
TEST_USER_ID = "manager_1"


def ask(
    message: str,
    entity_type: str = "ticket",
    entity_id: str = "TKT-501",
    session_id: str | None = None,
):
    return chat_service.send_message(
        ChatRequest(
            session_id=session_id,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message,
        ),
        user_id=TEST_USER_ID,
    )


def main() -> int:
    store = InMemorySessionStore()
    chat_service.set_session_store(store)

    # Record what the agent was handed on each call so history can be asserted.
    calls: list[dict] = []

    def fake_answer(
        entity_type,
        entity_id,
        message,
        history=(),
        action_guidance=None,
        tools_used=None,
        user=None,
    ):
        # Mirror the real agent: unknown ids raise before anything is stored.
        known = {
            "ticket": {"TKT-501", "TKT-502"},
            "order": {"ORD-1001"},
        }

        if entity_id not in known.get(entity_type, set()):
            raise EntityNotFoundError(entity_type, entity_id)

        calls.append(
            {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "message": message,
                "history": list(history),
            }
        )

        return f"[answer to {message!r} for {entity_id}]"

    chat_service.answer_conversational = fake_answer  # type: ignore[assignment]

    print("\n1. a new conversation generates a session id")
    first = ask("What is the severity?")
    check("session id generated", bool(first.session_id))
    check("entity echoed", first.entity_type == "ticket" and first.entity_id == "TKT-501")
    check("first turn has empty history", calls[-1]["history"] == [])

    print("\n2. follow-ups receive the prior turns")
    second = ask("Why is it that severity?", session_id=first.session_id)
    check("session id is stable", second.session_id == first.session_id)

    history = calls[-1]["history"]
    check("history has 2 messages", len(history) == 2, f"got {len(history)}")
    check("history[0] is the first question", history[0].role == "user"
          and history[0].content == "What is the severity?")
    check("history[1] is the first answer", history[1].role == "assistant")
    check(
        "retrieval uses the new message",
        calls[-1]["message"] == "Why is it that severity?",
    )

    third = ask("What should I tell the customer?", session_id=first.session_id)
    check("third turn sees 4 messages", len(calls[-1]["history"]) == 4)
    check("transcript stored", len(store.get(third.session_id).messages) == 6)

    print("\n3. history is scoped per session")
    other = ask("Is there a workaround?", entity_id="TKT-502")
    check("different session id", other.session_id != first.session_id)
    check("no leaked history", calls[-1]["history"] == [])

    order = ask("Can this be cancelled?", entity_type="order", entity_id="ORD-1001")
    check("order session is separate", order.session_id not in
          {first.session_id, other.session_id})
    check("order conversation starts clean", calls[-1]["history"] == [])

    print("\n4. reusing a session for a different record is rejected")
    for entity_type, entity_id, label in [
        ("ticket", "TKT-502", "different ticket"),
        ("order", "ORD-1001", "an order"),
    ]:
        try:
            ask("leak?", entity_type=entity_type, entity_id=entity_id,
                session_id=first.session_id)
            check(f"rejects {label}", False, "no error raised")
        except SessionEntityMismatchError as error:
            check(f"rejects {label}", True)
            check(
                f"error names both records ({label})",
                "TKT-501" in str(error) and entity_id in str(error),
            )

    check(
        "rejected turn did not touch the transcript",
        len(store.get(first.session_id).messages) == 6,
    )

    print("\n5. unknown ids raise EntityNotFoundError and store nothing")
    before = store.count()

    try:
        ask("What is the severity?", entity_id="TKT-999")
        check("unknown ticket raises", False, "no error raised")
    except EntityNotFoundError as error:
        check("unknown ticket raises", True)
        check("message is useful", str(error) == "Ticket TKT-999 not found",
              str(error))

    try:
        ask("Cancel?", entity_type="order", entity_id="ORD-9999")
        check("unknown order raises", False, "no error raised")
    except EntityNotFoundError as error:
        check("unknown order raises", True)
        check("message is useful", str(error) == "Order ORD-9999 not found",
              str(error))

    check("no empty session created", store.count() == before,
          f"{before} -> {store.count()}")

    print("\n6. the history window is bounded")
    long_session = ask("turn 0").session_id

    for index in range(1, 30):
        ask(f"turn {index}", session_id=long_session)

    window = calls[-1]["history"]
    check(
        f"window capped at {chat_service.MAX_HISTORY_MESSAGES}",
        len(window) <= chat_service.MAX_HISTORY_MESSAGES,
        f"got {len(window)}",
    )
    check("window starts on a user turn", window[0].role == "user")
    check(
        "window keeps the most recent turns",
        window[-1].content == "[answer to 'turn 28' for TKT-501]",
        window[-1].content,
    )

    print("\n7. an unknown session id is honoured rather than rejected")
    supplied = ask("client generated id", session_id="my-own-session-id")
    check("client id preserved", supplied.session_id == "my-own-session-id")

    print("\n8. history windowing never opens on an assistant reply")
    trimmed = chat_service._history_window(
        [ChatMessage(role="assistant", content="dangling")]
        + [
            ChatMessage(role="user" if i % 2 == 0 else "assistant", content=str(i))
            for i in range(40)
        ]
    )
    check("no dangling assistant reply", trimmed[0].role == "user")

    print()

    if failures:
        print(f"{len(failures)} FAILED, {passed} passed\n")
        for failure in failures:
            print(f"  x {failure}")
        return 1

    print(f"all {passed} assertions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
