"""End-to-end API tests against a running backend.

Start the server first, then run this:

    uvicorn app.main:app --reload
    python -m scripts.test_chat_api

Covers the health check, both original single-turn endpoints, a three-turn
ticket conversation, an order conversation, session scoping, and the 404/409
error paths. Uses only the standard library so it adds no dependencies.

Real Anthropic Claude calls are made, so expect this to take a minute or so.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
TIMEOUT_SECONDS = 120

failures: list[str] = []
passed = 0


def check(name: str, condition: bool, detail: str = "") -> bool:
    global passed

    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failures.append(f"{name}{f' — {detail}' if detail else ''}")
        print(f"  FAIL  {name}{f' — {detail}' if detail else ''}")

    return condition


def call(
    base_url: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    """Perform one HTTP call, returning (status, parsed body)."""

    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None

    except urllib.error.HTTPError as error:
        raw = error.read().decode()

        try:
            return error.code, json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return error.code, raw

    except urllib.error.URLError as error:
        raise SystemExit(
            f"\nCould not reach {base_url} ({error.reason}).\n"
            f"Start the backend first: uvicorn app.main:app --reload\n"
        )


def answer_of(body: Any) -> str:
    """Pull the answer out of a response body, tolerating error payloads."""

    return body.get("answer", "") if isinstance(body, dict) else ""


def detail_of(body: Any) -> str:
    """Pull FastAPI's `detail` out of a response body, tolerating plain text."""

    return body.get("detail", "") if isinstance(body, dict) else str(body)


def preview(text: str, width: int = 260) -> str:
    collapsed = " ".join(str(text).split())
    return collapsed if len(collapsed) <= width else f"{collapsed[:width]}…"


def quota_free_checks(base: str) -> int:
    """The 404 and validation paths, which return before any model call."""

    print("\n2. invalid ids return 404, not 500")

    for path, body_in, expected in [
        ("/api/tickets/TKT-999/answer", {"query": "What is the severity?"},
         "Ticket TKT-999 not found"),
        ("/api/orders/ORD-9999/answer", {"query": "Cancel?"},
         "Order ORD-9999 not found"),
    ]:
        status, body = call(base, "POST", path, body_in)
        check(f"404 from {path}", status == 404, f"got {status}: {preview(body)}")
        check("useful detail", detail_of(body) == expected, str(body))

    for entity_type, entity_id, expected in [
        ("ticket", "TKT-999", "Ticket TKT-999 not found"),
        ("order", "ORD-9999", "Order ORD-9999 not found"),
    ]:
        status, body = call(
            base,
            "POST",
            "/api/chat",
            {"entity_type": entity_type, "entity_id": entity_id, "message": "hello"},
        )
        check(f"chat 404 for unknown {entity_type}", status == 404,
              f"got {status}: {preview(body)}")
        check("useful detail", detail_of(body) == expected, str(body))

    print("\n3. malformed requests are rejected with 422")

    for label, payload in [
        ("blank message", {"entity_type": "ticket", "entity_id": "TKT-501",
                           "message": "   "}),
        ("missing message", {"entity_type": "ticket", "entity_id": "TKT-501"}),
        ("bad entity_type", {"entity_type": "invoice", "entity_id": "INV-1",
                             "message": "hello"}),
        ("blank entity_id", {"entity_type": "ticket", "entity_id": "",
                             "message": "hello"}),
    ]:
        status, _ = call(base, "POST", "/api/chat", payload)
        check(f"{label} 422", status == 422, f"got {status}")

    print("\n4. an unknown id never leaves a session behind")
    status, body = call(
        base,
        "POST",
        "/api/chat",
        {"entity_type": "ticket", "entity_id": "TKT-404",
         "message": "does this create a session?"},
    )
    check("404 not 200", status == 404, f"got {status}")
    check("no session_id returned", "session_id" not in str(body), str(body))

    return report()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--no-model",
        action="store_true",
        help=(
            "Run only the checks that consume no Anthropic rate limits (health, 404s, "
            "request validation). Useful when rate limits are hit."
        ),
    )
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    print(f"\nTesting {base}\n" + "=" * 72)

    if args.no_model:
        print("--no-model: skipping every section that calls Claude")

    # ------------------------------------------------------------ 1. health
    print("\n1. GET /health")
    status, body = call(base, "GET", "/health")
    check("200 OK", status == 200, f"got {status}")
    check("status ok", isinstance(body, dict) and body.get("status") == "ok", str(body))

    if args.no_model:
        return quota_free_checks(base)

    # ------------------------------------- 2. existing single-turn endpoints
    print("\n2. POST /api/tickets/TKT-501/answer  (existing endpoint)")
    status, body = call(
        base,
        "POST",
        "/api/tickets/TKT-501/answer",
        {
            "query": "All shipment creation is failing with HTTP 500. "
            "What is the severity and response time?"
        },
    )
    check("200 OK", status == 200, f"got {status}: {preview(body)}")
    if isinstance(body, dict):
        check("id echoed", body.get("id") == "TKT-501", str(body.get("id")))
        check("answer present", bool(body.get("answer")))
        print(f"        {preview(answer_of(body))}")

    print("\n3. POST /api/orders/ORD-1001/answer  (existing endpoint)")
    status, body = call(
        base,
        "POST",
        "/api/orders/ORD-1001/answer",
        {"query": "Can this booked shipment be cancelled without a fee?"},
    )
    check("200 OK", status == 200, f"got {status}: {preview(body)}")
    if isinstance(body, dict):
        check("id echoed", body.get("id") == "ORD-1001", str(body.get("id")))
        check("answer present", bool(body.get("answer")))
        print(f"        {preview(answer_of(body))}")

    # ------------------------------------------------ 4-6. ticket conversation
    print("\n4. POST /api/chat  — first message")
    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "entity_type": "ticket",
            "entity_id": "TKT-501",
            "message": "All shipment creation is failing. What is the severity?",
        },
    )
    if not check("200 OK", status == 200, f"got {status}: {preview(body)}"):
        return report()

    session_id = body["session_id"]
    check("session_id generated", bool(session_id))
    check("entity_type echoed", body["entity_type"] == "ticket")
    check("entity_id echoed", body["entity_id"] == "TKT-501")
    first_answer = body["answer"]
    print(f"        session: {session_id}")
    print(f"        {preview(first_answer)}")

    print("\n5. POST /api/chat  — follow-up 'Why is it that severity?'")
    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": "TKT-501",
            "message": "Why is it that severity?",
        },
    )
    check("200 OK", status == 200, f"got {status}: {preview(body)}")
    check("same session", isinstance(body, dict) and body.get("session_id") == session_id)
    second_answer = answer_of(body)
    print(f"        {preview(second_answer)}")

    # A model that lost the thread would ask what "that severity" refers to.
    check(
        "follow-up resolved the reference without re-asking",
        "?" not in second_answer.split("\n")[0]
        or any(token in second_answer.upper() for token in ("P1", "P2", "P3")),
        preview(second_answer, 120),
    )

    print("\n6. POST /api/chat  — follow-up 'What should I tell the customer?'")
    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": "TKT-501",
            "message": "What should I tell the customer?",
        },
    )
    check("200 OK", status == 200, f"got {status}: {preview(body)}")
    check("same session", isinstance(body, dict) and body.get("session_id") == session_id)
    third_answer = answer_of(body)
    print(f"        {preview(third_answer)}")
    check(
        "third turn still knows the incident context",
        any(
            token in third_answer.upper()
            for token in ("P1", "SHIPMENT", "CRITICAL", "INCIDENT")
        ),
        preview(third_answer, 120),
    )

    # ------------------------------------------------- 7. order conversation
    print("\n7. POST /api/chat  — order conversation")
    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "entity_type": "order",
            "entity_id": "ORD-1001",
            "message": "Can this shipment be cancelled?",
        },
    )
    check("200 OK", status == 200, f"got {status}: {preview(body)}")
    order_session = body.get("session_id") if isinstance(body, dict) else None
    check("separate session", order_session != session_id)
    print(f"        {preview(answer_of(body))}")

    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "session_id": order_session,
            "entity_type": "order",
            "entity_id": "ORD-1001",
            "message": "Would a fee apply if we cancelled it right now?",
        },
    )
    check("order follow-up 200 OK", status == 200, f"got {status}: {preview(body)}")
    print(f"        {preview(answer_of(body))}")

    # ----------------------------------------------------- 8. invalid ids 404
    print("\n8. invalid ids return 404, not 500")

    status, body = call(
        base, "POST", "/api/tickets/TKT-999/answer", {"query": "What is the severity?"}
    )
    check("ticket endpoint 404", status == 404, f"got {status}: {preview(body)}")
    check(
        "useful detail",
        detail_of(body) == "Ticket TKT-999 not found",
        str(body),
    )

    status, body = call(
        base, "POST", "/api/orders/ORD-9999/answer", {"query": "Cancel?"}
    )
    check("order endpoint 404", status == 404, f"got {status}: {preview(body)}")
    check(
        "useful detail",
        detail_of(body) == "Order ORD-9999 not found",
        str(body),
    )

    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "entity_type": "ticket",
            "entity_id": "TKT-999",
            "message": "What is the severity?",
        },
    )
    check("chat 404 for unknown ticket", status == 404, f"got {status}: {preview(body)}")
    check(
        "useful detail",
        detail_of(body) == "Ticket TKT-999 not found",
        str(body),
    )

    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "entity_type": "order",
            "entity_id": "ORD-9999",
            "message": "Can this be cancelled?",
        },
    )
    check("chat 404 for unknown order", status == 404, f"got {status}: {preview(body)}")
    check(
        "useful detail",
        detail_of(body) == "Order ORD-9999 not found",
        str(body),
    )

    # ------------------------------------------- 9. session scoping is enforced
    print("\n9. a session cannot be reused for another record")
    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "session_id": session_id,
            "entity_type": "ticket",
            "entity_id": "TKT-502",
            "message": "What is the severity?",
        },
    )
    check("409 Conflict", status == 409, f"got {status}: {preview(body)}")
    check(
        "detail names both records",
        "TKT-501" in detail_of(body) and "TKT-502" in detail_of(body),
        str(body),
    )

    status, body = call(
        base,
        "POST",
        "/api/chat",
        {
            "session_id": session_id,
            "entity_type": "order",
            "entity_id": "ORD-1001",
            "message": "Can this be cancelled?",
        },
    )
    check("409 for cross-type reuse", status == 409, f"got {status}: {preview(body)}")

    # ------------------------------------------------- 10. request validation
    print("\n10. malformed requests are rejected with 422")

    status, _ = call(
        base,
        "POST",
        "/api/chat",
        {"entity_type": "ticket", "entity_id": "TKT-501", "message": "   "},
    )
    check("blank message 422", status == 422, f"got {status}")

    status, _ = call(
        base,
        "POST",
        "/api/chat",
        {"entity_type": "invoice", "entity_id": "INV-1", "message": "hello"},
    )
    check("bad entity_type 422", status == 422, f"got {status}")

    return report()


def report() -> int:
    print("\n" + "=" * 72)

    if failures:
        print(f"{len(failures)} FAILED, {passed} passed\n")
        for failure in failures:
            print(f"  x {failure}")
        return 1

    print(f"all {passed} assertions passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
