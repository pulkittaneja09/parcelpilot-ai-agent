"""State-changing agent tool: ticket/order escalation.

The third tool, and the only one that mutates anything. Two phases, deliberately
separate:

* :func:`prepare_escalation` records an *intent*. Nothing is created.
* :func:`execute_escalation` creates the escalation, and only runs once the
  support agent has explicitly confirmed.

Nothing here executes on the first request. The pending intent is keyed by chat
session, so a confirmation can only ever complete the action that was prepared
in that same conversation — a "yes" in one session cannot fire an escalation
prepared in another.

Storage is a process-local dict: the action is mocked, as the assessment allows.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any

from app.config.demo_users import DemoUser
from app.models.chat import EntityType
from app.services.access_control import authorise_entity_access


#: Phrases that count as explicit approval of a prepared action. Matched only
#: when an action is already pending, so a bare "yes" can never start one.
_CONFIRM_PATTERNS = (
    r"\byes\b",
    r"\bconfirm(?:ed|ing|s)?\b",
    r"\bproceed\b",
    r"\bgo ahead\b",
    r"\bdo it\b",
    r"\bapprove(?:d)?\b",
    r"\bconfirm escalation\b",
    r"\byep\b",
    r"\byeah\b",
    r"\bok(?:ay)?\b",
)

#: Phrases that withdraw a prepared action. Checked first, so "no, don't
#: confirm" is a rejection rather than a confirmation.
_REJECT_PATTERNS = (
    r"\bno\b",
    r"\bdon'?t\b",
    r"\bdo not\b",
    r"\bcancel\b",
    r"\bstop\b",
    r"\bnever ?mind\b",
    r"\bhold off\b",
    r"\bwait\b",
    r"\bnot yet\b",
)

#: Phrases that ask for an escalation. Present tense / imperative only — asking
#: "why was this escalated" is a question about history, not a request.
_ESCALATION_PATTERNS = (
    r"\bescalate\b",
    r"\bescalation\b",
    r"\braise (?:this|it) to\b",
    r"\bpage (?:the )?(?:on-?call|engineering)\b",
)

#: Past-tense/informational mentions that should not prepare an action.
_ESCALATION_EXCLUSIONS = (
    r"\bwas escalated\b",
    r"\bhas been escalated\b",
    r"\bwere escalated\b",
    r"\balready escalated\b",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _matches(message: str, patterns: tuple[str, ...]) -> bool:
    lowered = message.lower()

    return any(re.search(pattern, lowered) for pattern in patterns)


def is_escalation_request(message: str) -> bool:
    """True when the support agent is asking for an escalation."""

    if _matches(message, _ESCALATION_EXCLUSIONS):
        return False

    return _matches(message, _ESCALATION_PATTERNS)


def is_confirmation(message: str) -> bool:
    """True when the message explicitly approves a pending action.

    Rejections are tested first so "no, don't do it" never reads as approval.
    """

    if _matches(message, _REJECT_PATTERNS):
        return False

    return _matches(message, _CONFIRM_PATTERNS)


def is_rejection(message: str) -> bool:
    """True when the message withdraws a pending action."""

    return _matches(message, _REJECT_PATTERNS)


@dataclass
class PendingEscalation:
    """An escalation that has been prepared but *not* created."""

    session_id: str
    entity_type: EntityType
    entity_id: str
    account_id: str | None
    reason: str
    prepared_at: datetime = field(default_factory=_now)

    def as_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "account_id": self.account_id,
            "reason": self.reason,
            "status": "awaiting_confirmation",
            "prepared_at": self.prepared_at.isoformat(),
        }


@dataclass
class Escalation:
    """A created escalation record."""

    escalation_id: str
    entity_type: EntityType
    entity_id: str
    account_id: str | None
    reason: str
    session_id: str
    status: str = "created"
    created_at: datetime = field(default_factory=_now)

    def as_dict(self) -> dict[str, Any]:
        return {
            "escalation_id": self.escalation_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "account_id": self.account_id,
            "reason": self.reason,
            "session_id": self.session_id,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }


_lock = RLock()
_pending: dict[str, PendingEscalation] = {}
_escalations: dict[str, Escalation] = {}


def prepare_escalation(
    *,
    session_id: str,
    entity_type: EntityType,
    entity_id: str,
    account_id: str | None,
    reason: str,
    user: DemoUser | None = None,
) -> PendingEscalation:
    """Record an escalation intent for ``session_id``. Creates nothing.

    Re-checks the user's scope independently of the layer above: a state-changing
    tool must never take authorisation on trust.

    Raises:
        AccountAccessDeniedError: the record is outside the user's scope.
    """

    if user is not None:
        authorise_entity_access(entity_type, entity_id, user)

    pending = PendingEscalation(
        session_id=session_id,
        entity_type=entity_type,
        entity_id=entity_id,
        account_id=account_id,
        reason=reason,
    )

    with _lock:
        _pending[session_id] = pending

    return pending


def get_pending_escalation(session_id: str | None) -> PendingEscalation | None:
    """Return the escalation awaiting confirmation in this session, if any."""

    if not session_id:
        return None

    with _lock:
        return _pending.get(session_id)


def discard_pending_escalation(session_id: str | None) -> bool:
    """Drop a prepared escalation without creating it. Returns whether one existed."""

    if not session_id:
        return False

    with _lock:
        return _pending.pop(session_id, None) is not None


def execute_escalation(
    pending: PendingEscalation,
    user: DemoUser | None = None,
) -> Escalation:
    """Create the escalation. Call only after explicit confirmation.

    Authorisation is re-verified here, at the moment of mutation, rather than
    inherited from whoever prepared the intent — so a scope change between
    preparation and confirmation is respected.

    The pending intent is consumed, so a second "yes" cannot create a duplicate.

    Raises:
        AccountAccessDeniedError: the record is outside the confirming user's
            scope.
    """

    if user is not None:
        authorise_entity_access(pending.entity_type, pending.entity_id, user)

    escalation = Escalation(
        escalation_id=f"ESC-{uuid.uuid4().hex[:8].upper()}",
        entity_type=pending.entity_type,
        entity_id=pending.entity_id,
        account_id=pending.account_id,
        reason=pending.reason,
        session_id=pending.session_id,
    )

    with _lock:
        _escalations[escalation.escalation_id] = escalation
        _pending.pop(pending.session_id, None)

    return escalation


def get_escalation(escalation_id: str) -> Escalation | None:
    """Look up a created escalation."""

    with _lock:
        return _escalations.get(escalation_id)


def list_escalations(
    entity_type: EntityType | None = None,
    entity_id: str | None = None,
) -> list[Escalation]:
    """Created escalations, newest first, optionally filtered by record."""

    with _lock:
        records = list(_escalations.values())

    if entity_type is not None:
        records = [r for r in records if r.entity_type == entity_type]

    if entity_id is not None:
        records = [r for r in records if r.entity_id == entity_id]

    return sorted(records, key=lambda r: r.created_at, reverse=True)


def reset() -> None:
    """Clear all pending and created escalations. Used by the test scripts."""

    with _lock:
        _pending.clear()
        _escalations.clear()
