"""Focused tests for role-based access control and the escalation tool.

Deterministic and offline: the model call and the retriever are replaced with
spies, so every check below runs without an API key and without touching quota.
The spies are what make the important assertions provable — that an unauthorised
request reaches *neither* retrieval *nor* the model.

Seeded ownership, and what ``support_agent_1`` (scope ACCT-001 + ACCT-003) may
therefore see:

    TKT-501  ACCT-001  allowed      ORD-1001  ACCT-001  allowed
    TKT-502  ACCT-002  DENIED       ORD-2001  ACCT-002  DENIED
    TKT-503  ACCT-003  allowed      ORD-3001  ACCT-003  allowed
    TKT-505  ACCT-004  DENIED

``manager_1`` and ``admin_1`` see every account.

Run with:

    python -m scripts.test_access_and_escalation
"""

from __future__ import annotations

import sys

from fastapi.testclient import TestClient

import app.agent.support_agent as support_agent
import app.services.chat_service as chat_service
from app.main import app
from app.services.session_store import InMemorySessionStore
from app.tools import escalation


# The Windows console defaults to cp1252, which cannot encode the arrows and
# emoji in this output. Reconfigure rather than downgrade the labels.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


PASSED = 0
FAILED = 0

#: A ticket inside support_agent_1's scope, and one outside it.
IN_SCOPE_TICKET = "TKT-501"      # ACCT-001
OUT_OF_SCOPE_TICKET = "TKT-502"  # ACCT-002

AGENT = {"X-User-ID": "support_agent_1"}
MANAGER = {"X-User-ID": "manager_1"}
ADMIN = {"X-User-ID": "admin_1"}


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED

    if condition:
        PASSED += 1
        print(f"  PASS  {label}")
    else:
        FAILED += 1
        print(f"  FAIL  {label}" + (f" — {detail}" if detail else ""))


# ------------------------------------------------------------------ spies


class Spy:
    """Records every call so tests can assert a tool did or did not run."""

    def __init__(self, name: str, result):
        self.name = name
        self.result = result
        self.calls: list[tuple] = []

    def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.result

    @property
    def called(self) -> bool:
        return len(self.calls) > 0

    def reset(self) -> None:
        self.calls.clear()


generate_spy = Spy("_generate", "Stubbed answer grounded in the seeded data.")
retrieve_spy = Spy(
    "retrieve_documents",
    [
        {
            "document": "No fee within 30 minutes of booking.",
            "metadata": {
                "filename": "03_Cancellation_and_Service_Credit_SOP_v4.pdf",
                "document_type": "cancellation_sop",
                "status": "current",
                "account_id": "GLOBAL",
                "precedence": 2,
                "chunk_index": 0,
            },
            "distance": 0.4,
        }
    ],
)

# Patched on the module that *uses* them, which is where the lookups resolve.
support_agent._generate = generate_spy
support_agent.retrieve_documents = retrieve_spy


def reset_spies() -> None:
    generate_spy.reset()
    retrieve_spy.reset()


client = TestClient(app)


def fresh_state() -> None:
    """Isolate each section: new session store, no escalations, no spy calls."""

    chat_service.set_session_store(InMemorySessionStore())
    escalation.reset()
    reset_spies()


def ask(entity_id: str, headers: dict | None = None, **extra):
    """POST one chat turn about a ticket."""

    payload = {
        "entity_type": "ticket",
        "entity_id": entity_id,
        "message": "What is the severity?",
    }
    payload.update(extra)

    return client.post("/api/chat", json=payload, headers=headers)


# ------------------------------------------------ 1-4: the role matrix


def test_authorised_access() -> None:
    """TEST 1 — a support agent reads a ticket inside their scope."""

    print("\n1. Support agent, ticket in scope → granted")
    fresh_state()

    response = ask(IN_SCOPE_TICKET, AGENT)
    check("200", response.status_code == 200, response.text)
    check("retriever ran", retrieve_spy.called)
    check("model ran", generate_spy.called)

    reset_spies()
    response = ask("TKT-503", AGENT)  # ACCT-003, the agent's other account
    check("second in-scope account → 200", response.status_code == 200, response.text)


def test_cross_account_denied() -> None:
    """TEST 2 — the same agent types a ticket belonging to another account."""

    print("\n2. Support agent, ticket out of scope → ACCESS_DENIED")
    fresh_state()

    response = ask(OUT_OF_SCOPE_TICKET, AGENT)
    check("403", response.status_code == 403, response.text)
    check("no context/retrieval reached ChromaDB", not retrieve_spy.called)
    check("no model call", not generate_spy.called)
    check(
        "denial says access denied",
        "access denied" in response.text.lower(),
        response.text,
    )
    check(
        "403 does not name the owning account",
        "ACCT-002" not in response.text,
        response.text,
    )

    reset_spies()
    response = client.post(
        "/api/orders/ORD-2001/answer",
        json={"query": "Does a cancellation fee apply?"},
        headers=AGENT,
    )
    check("order out of scope → 403", response.status_code == 403, response.text)
    check("no retrieval", not retrieve_spy.called)
    check("no model call", not generate_spy.called)

    reset_spies()
    response = client.post(
        f"/api/tickets/{OUT_OF_SCOPE_TICKET}/answer",
        json={"query": "What is the severity?"},
        headers=AGENT,
    )
    check("single-turn ticket out of scope → 403", response.status_code == 403)
    check("no retrieval", not retrieve_spy.called)
    check("no model call", not generate_spy.called)


def test_manager_access() -> None:
    """TEST 3 — a manager reads the ticket the agent could not."""

    print("\n3. Manager, same ticket → granted")
    fresh_state()

    response = ask(OUT_OF_SCOPE_TICKET, MANAGER)
    check("200", response.status_code == 200, response.text)
    check("retriever ran", retrieve_spy.called)
    check("model ran", generate_spy.called)

    reset_spies()
    response = ask("TKT-505", MANAGER)  # ACCT-004
    check("every seeded account → 200", response.status_code == 200, response.text)


def test_admin_access() -> None:
    """TEST 4 — an admin reads it too."""

    print("\n4. Admin, same ticket → granted")
    fresh_state()

    response = ask(OUT_OF_SCOPE_TICKET, ADMIN)
    check("200", response.status_code == 200, response.text)

    response = client.post(
        f"/api/tickets/{OUT_OF_SCOPE_TICKET}/answer",
        json={"query": "What is the severity?"},
        headers=ADMIN,
    )
    check("single-turn → 200", response.status_code == 200, response.text)


# ---------------------------------- 5: the client cannot widen its access


def test_client_cannot_bypass() -> None:
    """TEST 5 — nothing the frontend sends can grant access."""

    print("\n5. Client input cannot bypass backend authorisation")
    fresh_state()

    # A stale X-Account-ID is ignored entirely: it is not consulted.
    response = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": OUT_OF_SCOPE_TICKET,
            "message": "What is the severity?",
        },
        headers={**AGENT, "X-Account-ID": "ACCT-002"},
    )
    check("spoofed X-Account-ID still 403", response.status_code == 403, response.text)
    check("no retrieval", not retrieve_spy.called)
    check("no model call", not generate_spy.called)

    # Claiming a privileged role in the body changes nothing.
    reset_spies()
    response = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": OUT_OF_SCOPE_TICKET,
            "message": "What is the severity?",
            "role": "admin",
            "account_id": "ACCT-002",
        },
        headers=AGENT,
    )
    check("role claimed in body still 403", response.status_code == 403, response.text)
    check("no model call", not generate_spy.called)

    # An unknown user is rejected, not silently downgraded or upgraded.
    reset_spies()
    response = ask(IN_SCOPE_TICKET, {"X-User-ID": "root"})
    check("unknown user → 401", response.status_code == 401, response.text)
    check("no retrieval", not retrieve_spy.called)
    check("no model call", not generate_spy.called)

    # No header at all falls back to the least-privileged user, so it cannot see
    # more than that user — an out-of-scope ticket is still refused.
    reset_spies()
    response = ask(OUT_OF_SCOPE_TICKET)
    check("no header, out of scope → 403", response.status_code == 403, response.text)
    check("no model call", not generate_spy.called)

    reset_spies()
    response = ask(IN_SCOPE_TICKET)
    check(
        "no header, in scope → 200 (defaults to support_agent_1)",
        response.status_code == 200,
        response.text,
    )

    # An unknown id is still a 404 for an authorised user.
    reset_spies()
    response = ask("TKT-999", AGENT)
    check("unknown id → 404", response.status_code == 404, response.text)
    check("no model call", not generate_spy.called)


# ------------------------------------------------- state-changing action


def test_escalation_requires_confirmation() -> None:
    print("\n6. State-changing action — confirmation required")
    fresh_state()

    response = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Escalate this ticket",
        },
        headers=AGENT,
    )
    check("escalation request → 200", response.status_code == 200, response.text)

    body = response.json()
    session_id = body["session_id"]

    check("nothing was created", escalation.list_escalations() == [])
    check("pending_action returned", body.get("pending_action") is not None)
    check(
        "pending status is awaiting_confirmation",
        (body.get("pending_action") or {}).get("status") == "awaiting_confirmation",
        str(body.get("pending_action")),
    )
    check("no action_result on the prepare turn", body.get("action_result") is None)
    check(
        "answer asks for confirmation",
        "confirm" in body["answer"].lower(),
        body["answer"][:200],
    )
    check(
        "investigation ran before preparing (retriever + model)",
        retrieve_spy.called and generate_spy.called,
    )

    tool_names = [tool["name"] for tool in body["tools_used"]]
    check(
        "three tools reported on the prepare turn",
        tool_names
        == ["structured_data_lookup", "document_search", "escalation_action"],
        str(tool_names),
    )

    # A follow-up that is not a confirmation must not execute the action.
    reset_spies()
    response = client.post(
        "/api/chat",
        json={
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "What does the agreement say about response times?",
        },
        headers=AGENT,
    )
    check("unrelated follow-up → 200", response.status_code == 200, response.text)
    check(
        "still nothing created",
        escalation.list_escalations() == [],
        str(escalation.list_escalations()),
    )

    # Now confirm.
    reset_spies()
    response = client.post(
        "/api/chat",
        json={
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Yes, confirm escalation",
        },
        headers=AGENT,
    )
    check("confirmation → 200", response.status_code == 200, response.text)

    body = response.json()
    result = body.get("action_result") or {}

    check("escalation created", len(escalation.list_escalations()) == 1)
    check("action_result returned", bool(result), str(body))
    check("has escalation_id", bool(result.get("escalation_id")), str(result))
    check("status is created", result.get("status") == "created", str(result))
    check("has a timestamp", bool(result.get("created_at")), str(result))
    check(
        "bound to the right entity",
        result.get("entity_id") == IN_SCOPE_TICKET
        and result.get("entity_type") == "ticket",
        str(result),
    )
    check(
        "bound to the right account",
        result.get("account_id") == "ACCT-001",
        str(result),
    )
    check(
        "bound to the right session",
        result.get("session_id") == session_id,
        str(result),
    )
    check(
        "escalation tool reported",
        [t["name"] for t in body["tools_used"]] == ["escalation_action"],
        str(body["tools_used"]),
    )
    check("confirmation needed no model call", not generate_spy.called)

    # A second confirmation must not create a duplicate.
    client.post(
        "/api/chat",
        json={
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Yes, confirm",
        },
        headers=AGENT,
    )
    check(
        "second confirmation creates no duplicate",
        len(escalation.list_escalations()) == 1,
        str(escalation.list_escalations()),
    )


def test_escalation_respects_scope() -> None:
    """A support agent cannot escalate a ticket they may not even read."""

    print("\n7. State-changing action — refused outside the caller's scope")
    fresh_state()

    response = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": OUT_OF_SCOPE_TICKET,
            "message": "Escalate this ticket",
        },
        headers=AGENT,
    )
    check("403", response.status_code == 403, response.text)
    check("nothing prepared", escalation.list_escalations() == [])
    check("no model call", not generate_spy.called)

    # A manager can, and it still requires confirmation.
    reset_spies()
    body = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": OUT_OF_SCOPE_TICKET,
            "message": "Escalate this ticket",
        },
        headers=MANAGER,
    ).json()

    check("manager can prepare", body.get("pending_action") is not None)
    check("still not created", escalation.list_escalations() == [])

    body = client.post(
        "/api/chat",
        json={
            "session_id": body["session_id"],
            "entity_type": "ticket",
            "entity_id": OUT_OF_SCOPE_TICKET,
            "message": "Yes, confirm",
        },
        headers=MANAGER,
    ).json()

    check("manager confirmation creates it", len(escalation.list_escalations()) == 1)
    check(
        "recorded against the right account",
        (body.get("action_result") or {}).get("account_id") == "ACCT-002",
        str(body.get("action_result")),
    )


def test_escalation_rejection() -> None:
    print("\n8. State-changing action — declined")
    fresh_state()

    body = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Please escalate this ticket",
        },
        headers=AGENT,
    ).json()

    session_id = body["session_id"]
    check("prepared", escalation.get_pending_escalation(session_id) is not None)

    client.post(
        "/api/chat",
        json={
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "No, hold off",
        },
        headers=AGENT,
    )

    check("pending discarded", escalation.get_pending_escalation(session_id) is None)
    check("nothing created", escalation.list_escalations() == [])


def test_confirmation_cannot_start_an_action() -> None:
    print("\n9. A bare confirmation with nothing pending creates nothing")
    fresh_state()

    response = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Yes, confirm",
        },
        headers=AGENT,
    )

    check("answered normally", response.status_code == 200, response.text)
    check("no escalation created", escalation.list_escalations() == [])
    check("no action_result", response.json().get("action_result") is None)


def test_escalation_is_session_scoped() -> None:
    print("\n10. A confirmation cannot complete another session's action")
    fresh_state()

    prepared = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Escalate this ticket",
        },
        headers=AGENT,
    ).json()

    # A different conversation about the same record, confirming out of the blue.
    other = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Yes, confirm",
        },
        headers=AGENT,
    ).json()

    check("separate sessions", other["session_id"] != prepared["session_id"])
    check("no escalation created", escalation.list_escalations() == [])
    check(
        "the original action is still pending",
        escalation.get_pending_escalation(prepared["session_id"]) is not None,
    )


# ----------------------------------------------------------- regression


def test_multi_turn_regression() -> None:
    print("\n11. Regression — multi-turn chat, sessions, and both endpoints")
    fresh_state()

    first = ask(IN_SCOPE_TICKET, AGENT).json()

    check("session id returned", bool(first["session_id"]))
    check("entity echoed", first["entity_id"] == IN_SCOPE_TICKET)
    check("answer returned", bool(first["answer"]))

    second = client.post(
        "/api/chat",
        json={
            "session_id": first["session_id"],
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "Why is it that severity?",
        },
        headers=AGENT,
    ).json()

    check("session reused", second["session_id"] == first["session_id"])

    prompt = generate_spy.calls[-1][0][0]
    check("history replayed into the prompt", "What is the severity?" in prompt)
    check("ticket in the prompt", IN_SCOPE_TICKET in prompt)
    check("account in the prompt", "ACCT-001" in prompt)

    # Cross-record session reuse is still rejected — checked with a manager so
    # authorisation cannot be what produces the error.
    manager_session = ask(IN_SCOPE_TICKET, MANAGER).json()
    response = client.post(
        "/api/chat",
        json={
            "session_id": manager_session["session_id"],
            "entity_type": "ticket",
            "entity_id": OUT_OF_SCOPE_TICKET,
            "message": "Is there a workaround?",
        },
        headers=MANAGER,
    )
    check("cross-record session reuse → 409", response.status_code == 409, response.text)

    # Both single-turn endpoints still answer.
    response = client.post(
        f"/api/tickets/{IN_SCOPE_TICKET}/answer",
        json={"query": "What is the severity?"},
        headers=AGENT,
    )
    check(
        "ticket endpoint → 200 and echoes the id",
        response.status_code == 200
        and response.json()["id"] == IN_SCOPE_TICKET,
        response.text,
    )

    response = client.post(
        "/api/orders/ORD-1001/answer",
        json={"query": "Can this be cancelled?"},
        headers=AGENT,
    )
    check(
        "order endpoint → 200 and echoes the id",
        response.status_code == 200 and response.json()["id"] == "ORD-1001",
        response.text,
    )

    # Validation is unchanged.
    response = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": IN_SCOPE_TICKET,
            "message": "   ",
        },
        headers=AGENT,
    )
    check("blank message → 422", response.status_code == 422, response.text)

    response = client.get("/health")
    check("health → 200", response.status_code == 200, response.text)


def main() -> int:
    print("=" * 64)
    print("Role-based access control + escalation tool")
    print("=" * 64)

    test_authorised_access()
    test_cross_account_denied()
    test_manager_access()
    test_admin_access()
    test_client_cannot_bypass()
    test_escalation_requires_confirmation()
    test_escalation_respects_scope()
    test_escalation_rejection()
    test_confirmation_cannot_start_an_action()
    test_escalation_is_session_scoped()
    test_multi_turn_regression()

    print("\n" + "=" * 64)
    print(f"{PASSED} passed, {FAILED} failed")
    print("=" * 64)

    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
