"""FastAPI application entrypoint for the ParcelPilot AI Support Copilot backend.

Three surfaces, one RAG pipeline:

* ``POST /api/tickets/{ticket_id}/answer`` — single-turn ticket question
* ``POST /api/orders/{order_id}/answer``  — single-turn order question
* ``POST /api/chat``                      — multi-turn conversation

Error mapping is deliberately narrow: a missing ticket/order becomes a 404, a
cross-record session reuse a 409, and an exhausted model quota a 429. Anything
else — a retrieval failure, a bug — surfaces as a 500 so it stays visible.
"""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.agent.support_agent import MODEL_NAME, answer_order, answer_ticket
from app.errors import (
    EntityNotFoundError,
    ModelRateLimitError,
    SessionEntityMismatchError,
)
from app.models.chat import ChatRequest, ChatResponse
from app.services.chat_service import send_message


app = FastAPI(
    title="ParcelPilot AI Support Copilot",
    description=(
        "Context-aware, multi-turn conversational RAG support agent for "
        "ParcelPilot support operations."
    ),
    version="2.0.0",
)


# ---------------------------------------------------------------------- CORS

# The Vite dev server proxies /api and /health to this backend, so the browser
# normally makes same-origin requests and needs no CORS headers at all. The
# allowlist below covers the other supported setup — VITE_API_DIRECT=true, where
# the browser calls FastAPI directly from the dev-server origin.
#
# It is an explicit allowlist rather than "*" because credentials are enabled;
# for a deployment, set CORS_ALLOW_ORIGINS to the real frontend origin(s).
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",  # vite preview
    "http://127.0.0.1:4173",
]

_configured_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in _configured_origins.split(",")
    if origin.strip()
] or DEFAULT_ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# -------------------------------------------------------------- error mapping

# Registered once rather than repeated in every endpoint. Only these three
# domain errors are translated; everything else keeps propagating, so a genuine
# bug still produces a 500 with a traceback in the server log instead of being
# quietly reshaped into a client error.


@app.exception_handler(EntityNotFoundError)
def handle_entity_not_found(
    request: Request,
    error: EntityNotFoundError,
) -> JSONResponse:
    """An unknown ticket or order id is a 404, not a server error."""

    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(SessionEntityMismatchError)
def handle_session_mismatch(
    request: Request,
    error: SessionEntityMismatchError,
) -> JSONResponse:
    """409: the request is well-formed but conflicts with the session's state."""

    return JSONResponse(status_code=409, content={"detail": str(error)})


@app.exception_handler(ModelRateLimitError)
def handle_model_rate_limit(
    request: Request,
    error: ModelRateLimitError,
) -> JSONResponse:
    """429: the upstream model quota is exhausted — an expected condition."""

    headers = {}

    if error.retry_after_seconds is not None:
        headers["Retry-After"] = str(max(1, round(error.retry_after_seconds)))

    return JSONResponse(
        status_code=429,
        content={"detail": str(error)},
        headers=headers,
    )


# -------------------------------------------------------------------- models


class QuestionRequest(BaseModel):
    query: str


class AnswerResponse(BaseModel):
    id: str
    answer: str


# ------------------------------------------------------------------ endpoints


@app.get("/")
def root():
    """Return basic information about the API."""

    return {
        "message": "ParcelPilot AI Support Copilot is running"
    }


@app.get("/health")
def health() -> dict[str, str]:
    """Report that the backend service is running."""

    return {
        "status": "ok",
        "service": "ParcelPilot AI Support Copilot",
        "provider": "Agent Router",
        "model": MODEL_NAME,
    }


@app.post("/api/tickets/{ticket_id}/answer", response_model=AnswerResponse)
def answer_ticket_question(
    ticket_id: str,
    request: QuestionRequest,
):
    """Answer one question about a ticket, without conversation memory."""

    return {
        "id": ticket_id,
        "answer": answer_ticket(ticket_id=ticket_id, query=request.query),
    }


@app.post("/api/orders/{order_id}/answer", response_model=AnswerResponse)
def answer_order_question(
    order_id: str,
    request: QuestionRequest,
):
    """Answer one question about an order, without conversation memory."""

    return {
        "id": order_id,
        "answer": answer_order(order_id=order_id, query=request.query),
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    """Answer one turn of a conversation about a ticket or order.

    Omit ``session_id`` to start a conversation; send the one that comes back
    with every follow-up so the copilot can resolve references like "why is it
    that severity?" or "what should I tell the customer?".
    """

    return send_message(request)
