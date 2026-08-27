"""HTTP-level tests with the model stubbed out.

Exercises the real ASGI app — routing, Pydantic response models, and the
exception handlers in ``app/main.py`` — without spending Anthropic quota, so it runs
without an API key and is safe for CI. ``scripts/test_chat_api.py`` covers the
same endpoints against a live model.

Run with:
    python -m scripts.test_chat_http_stub
"""

from __future__ import annotations

import sys

from fastapi.testclient import TestClient

from app.agent import support_agent
from app.errors import ModelRateLimitError
from app.services import chat_service
from app.services.session_store import InMemorySessionStore


# The Windows console defaults to cp1252, which cannot encode the tool-activity
# emoji that now appear in response bodies printed on failure.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


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


def install_stub_model() -> list[str]:
    """Replace the Claude call with a deterministic echo.

    Everything above ``_generate`` stays real: context loading, retrieval,
    precedence sorting, and prompt construction all run, so a broken prompt or a
    missing record still fails here.
    """

    prompts: list[str] = []

    def fake_generate(prompt: str) -> str:
        prompts.append(prompt)
        return "**Stubbed answer.** Source: 01_Support_Policy_v3_CURRENT.pdf"

    support_agent._generate = fake_generate  # type: ignore[assignment]

    return prompts


def main() -> int:
    prompts = install_stub_model()
    chat_service.set_session_store(InMemorySessionStore())

    # Import after the stub is installed so the app picks it up either way.
    from app.main import app

    # Access control is enforced at the data layer from the X-User-ID header.
    # manager_1 has full account scope, so every record below is authorised and
    # the checks exercise routing and error mapping rather than authorisation.
    client = TestClient(
        app,
        raise_server_exceptions=False,
        headers={"X-User-ID": "manager_1"},
    )

    print("\n1. GET /health")
    response = client.get("/health")
    check("200", response.status_code == 200, str(response.status_code))
    check("payload", response.json().get("status") == "ok", response.text)

    print("\n2. existing single-turn endpoints still work")
    response = client.post(
        "/api/tickets/TKT-501/answer", json={"query": "What is the severity?"}
    )
    check("ticket 200", response.status_code == 200, response.text)
    check("shape {id, answer}",
          set(response.json()) == {"id", "answer"}, response.text)
    check("id echoed", response.json()["id"] == "TKT-501", response.text)

    response = client.post(
        "/api/orders/ORD-1001/answer", json={"query": "Can this be cancelled?"}
    )
    check("order 200", response.status_code == 200, response.text)
    check("id echoed", response.json()["id"] == "ORD-1001", response.text)

    print("\n3. POST /api/chat threads a session across turns")
    response = client.post(
        "/api/chat",
        json={
            "entity_type": "ticket",
            "entity_id": "TKT-501",
            "message": "What is the severity?",
        },
    )
    check("200", response.status_code == 200, response.text)

    first = response.json()
    check(
        "shape {session_id, entity_type, entity_id, answer}",
        {"session_id", "entity_type", "entity_id", "answer"} <= set(first),
        response.text,
    )
    session_id = first["session_id"]
    check("session_id generated", bool(session_id))
    check("entity echoed",
          first["entity_type"] == "ticket" and first["entity_id"] == "TKT-501")

    # The prompt for a first turn must carry the record and its account, and say
    # explicitly that there is no history yet. (The single-turn endpoints get no
    # history section at all — that is what selects the structured briefing
    # format instead of a conversational reply.)
    prompt = prompts[-1]
    check("prompt includes the ticket", "TKT-501" in prompt)
    check("prompt includes the account", "ACCT-001" in prompt)
    check("prompt includes retrieved documents", ".pdf" in prompt)
    check("prompt declares source precedence", "SOURCE PRECEDENCE" in prompt)
    check("first turn states there is no history",
          "No previous messages" in prompt, prompt[-400:])
    check("single-turn prompt has no history section",
          "CONVERSATION HISTORY" not in prompts[0], prompts[0][-400:])

    response = client.post(
        "/api/chat",
        json={
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": "TKT-501",
            "message": "Why is it that severity?",
        },
    )
    check("follow-up 200", response.status_code == 200, response.text)
    check("same session", response.json()["session_id"] == session_id)

    prompt = prompts[-1]
    check("follow-up prompt has history", "CONVERSATION HISTORY" in prompt)
    check("history carries the first question",
          "What is the severity?" in prompt)
    check("history carries the first answer", "Stubbed answer" in prompt)
    check("current message is marked",
          "CURRENT USER MESSAGE:\nWhy is it that severity?" in prompt)

    print("\n4. unknown ids map to 404")
    for path, payload, expected in [
        ("/api/tickets/TKT-999/answer", {"query": "?"}, "Ticket TKT-999 not found"),
        ("/api/orders/ORD-9999/answer", {"query": "?"}, "Order ORD-9999 not found"),
    ]:
        response = client.post(path, json=payload)
        check(f"404 {path}", response.status_code == 404, response.text)
        check("detail", response.json().get("detail") == expected, response.text)

    response = client.post(
        "/api/chat",
        json={"entity_type": "ticket", "entity_id": "TKT-999", "message": "?"},
    )
    check("chat 404", response.status_code == 404, response.text)
    check("detail", response.json().get("detail") == "Ticket TKT-999 not found",
          response.text)

    print("\n5. cross-record session reuse maps to 409")
    response = client.post(
        "/api/chat",
        json={
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": "TKT-502",
            "message": "What is the severity?",
        },
    )
    check("409", response.status_code == 409, response.text)
    check("detail names both records",
          "TKT-501" in response.json()["detail"]
          and "TKT-502" in response.json()["detail"], response.text)

    print("\n6. a model quota error maps to 429 with Retry-After")

    def rate_limited(prompt: str) -> str:
        raise ModelRateLimitError("quota exhausted", retry_after_seconds=42.4)

    support_agent._generate = rate_limited  # type: ignore[assignment]

    response = client.post(
        "/api/chat",
        json={"entity_type": "ticket", "entity_id": "TKT-501", "message": "hi"},
    )
    check("429", response.status_code == 429, response.text)
    check("Retry-After header", response.headers.get("retry-after") == "42",
          str(response.headers.get("retry-after")))
    check("detail", response.json().get("detail") == "quota exhausted",
          response.text)

    print("\n7. an unexpected model failure stays a 500")

    def broken(prompt: str) -> str:
        raise RuntimeError("something genuinely unexpected")

    support_agent._generate = broken  # type: ignore[assignment]

    response = client.post(
        "/api/chat",
        json={"entity_type": "ticket", "entity_id": "TKT-501", "message": "hi"},
    )
    check("500 not 404", response.status_code == 500, str(response.status_code))

    print("\n8. malformed bodies map to 422")
    for label, payload in [
        ("blank message", {"entity_type": "ticket", "entity_id": "TKT-501",
                           "message": "  "}),
        ("bad entity_type", {"entity_type": "invoice", "entity_id": "X",
                             "message": "hi"}),
        ("missing entity_id", {"entity_type": "ticket", "message": "hi"}),
    ]:
        response = client.post("/api/chat", json=payload)
        check(f"{label} 422", response.status_code == 422,
              str(response.status_code))

    print("\n9. CORS allows the Vite dev origin")
    response = client.options(
        "/api/chat",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    check("preflight ok", response.status_code in (200, 204),
          str(response.status_code))
    check(
        "origin allowed",
        response.headers.get("access-control-allow-origin")
        == "http://localhost:5173",
        str(response.headers.get("access-control-allow-origin")),
    )

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
