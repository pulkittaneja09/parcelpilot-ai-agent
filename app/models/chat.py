"""Pydantic schemas for the multi-turn chat API.

Mirrors what the frontend sends and receives on ``POST /api/chat``.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


#: The two kinds of operational record a conversation can be anchored to.
EntityType = Literal["ticket", "order"]

#: Who produced a message. Only these two roles are ever stored; the system
#: instructions live in the prompt builder, not in the transcript.
Role = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    """One turn of a conversation."""

    role: Role
    content: str


class ChatRequest(BaseModel):
    """Body of ``POST /api/chat``.

    ``session_id`` is optional: omit it to start a new conversation and the
    backend returns a generated id to send with every follow-up.
    """

    session_id: str | None = Field(
        default=None,
        max_length=128,
        description="Session to continue. Omit to start a new conversation.",
    )
    entity_type: EntityType = Field(
        description="Whether entity_id refers to a support ticket or an order.",
    )
    entity_id: str = Field(
        min_length=1,
        max_length=64,
        description="Operational record id, e.g. TKT-501 or ORD-1001.",
    )
    message: str = Field(
        min_length=1,
        max_length=4000,
        description="The support agent's question for this turn.",
    )

    @field_validator("entity_id", "message", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        """Trim surrounding whitespace so length limits apply to real content."""

        return value.strip() if isinstance(value, str) else value

    @field_validator("session_id", mode="before")
    @classmethod
    def _strip_optional(cls, value: object) -> object:
        """Treat a blank or whitespace-only session id as "not provided"."""

        if isinstance(value, str):
            return value.strip() or None

        return value


class ToolUse(BaseModel):
    """One tool the agent actually invoked while answering a turn.

    Populated from the real call sites — not narrated by the model — so the UI
    shows what ran rather than what the model claims ran.
    """

    #: Stable identifier: ``structured_data_lookup``, ``document_search``, or
    #: ``escalation_action``.
    name: str
    #: Short human-readable label, e.g. "Structured Data Lookup".
    label: str
    #: Emoji shown beside the label in the UI.
    icon: str
    #: What the call did on this turn, e.g. "Looked up ticket TKT-502".
    detail: str


class ChatResponse(BaseModel):
    """Reply from ``POST /api/chat``.

    ``session_id`` is echoed back — generated on the first turn — and must be
    sent with every follow-up to keep the conversation going.
    """

    session_id: str
    entity_type: EntityType
    entity_id: str
    answer: str
    #: Tools invoked for this turn, in call order.
    tools_used: list[ToolUse] = Field(default_factory=list)
    #: Set when a state-changing action is prepared and awaiting confirmation.
    pending_action: dict | None = None
    #: Set on the turn where a state-changing action actually executed.
    action_result: dict | None = None

