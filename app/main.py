"""FastAPI application entrypoint for the ParcelPilot AI Support Copilot backend."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.agent.support_agent import answer_ticket, answer_order


app = FastAPI(
    title="ParcelPilot AI Support Copilot",
    description="AI-powered support operations agent for ParcelPilot",
    version="1.0.0",
)


class QuestionRequest(BaseModel):
    query: str


class AnswerResponse(BaseModel):
    id: str
    answer: str


@app.get("/health")
def health() -> dict[str, str]:
    """Report that the backend service is running."""
    return {
        "status": "ok",
        "service": "ParcelPilot AI Support Copilot",
    }


@app.post("/api/tickets/{ticket_id}/answer", response_model=AnswerResponse)
def answer_ticket_question(
    ticket_id: str,
    request: QuestionRequest,
):
    try:
        answer = answer_ticket(
            ticket_id=ticket_id,
            query=request.query,
        )

        return {
            "id": ticket_id,
            "answer": answer,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )


@app.post("/api/orders/{order_id}/answer", response_model=AnswerResponse)
def answer_order_question(
    order_id: str,
    request: QuestionRequest,
):
    try:
        answer = answer_order(
            order_id=order_id,
            query=request.query,
        )

        return {
            "id": order_id,
            "answer": answer,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )