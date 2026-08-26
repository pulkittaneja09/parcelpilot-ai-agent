"""Storage for multi-turn chat sessions.

The chat service depends on the :class:`SessionStore` interface only, so the
in-memory implementation used for the MVP can be replaced by Redis or a
database table later without touching any business logic — implement the four
abstract methods and pass the new store to
:func:`app.services.chat_service.set_session_store`.

In-memory storage means sessions are lost when the process restarts and are not
shared between workers. See the README for the full list of trade-offs.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock

from app.models.chat import ChatMessage, EntityType


#: Hard cap on how many turns a single session retains. The prompt window is
#: far smaller (see ``chat_service``); this only bounds memory growth.
MAX_STORED_MESSAGES = 200

#: Oldest sessions are evicted past this point so a long-running process cannot
#: grow without limit.
MAX_SESSIONS = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ChatSession:
    """A conversation anchored to exactly one ticket or order."""

    session_id: str
    entity_type: EntityType
    entity_id: str
    messages: list[ChatMessage] = field(default_factory=list)
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)

    def matches(self, entity_type: str, entity_id: str) -> bool:
        """True when this session belongs to the given record."""

        return self.entity_type == entity_type and self.entity_id == entity_id

    def add_message(self, role: str, content: str) -> None:
        """Append a turn, dropping the oldest ones past ``MAX_STORED_MESSAGES``."""

        self.messages.append(ChatMessage(role=role, content=content))

        if len(self.messages) > MAX_STORED_MESSAGES:
            del self.messages[: len(self.messages) - MAX_STORED_MESSAGES]

        self.updated_at = _now()


class SessionStore(ABC):
    """Persistence boundary for chat sessions."""

    @abstractmethod
    def get(self, session_id: str) -> ChatSession | None:
        """Return the session, or ``None`` if it is unknown or expired."""

    @abstractmethod
    def create(
        self,
        entity_type: EntityType,
        entity_id: str,
        session_id: str | None = None,
    ) -> ChatSession:
        """Create and persist an empty session, generating an id if needed."""

    @abstractmethod
    def save(self, session: ChatSession) -> None:
        """Persist mutations made to ``session``."""

    @abstractmethod
    def delete(self, session_id: str) -> bool:
        """Drop a session. Returns whether it existed."""


class InMemorySessionStore(SessionStore):
    """Process-local session storage backed by an ordered dict.

    Access is guarded by a lock because FastAPI runs synchronous endpoints in a
    thread pool, so two turns of two different conversations can land at the
    same time.
    """

    def __init__(self, max_sessions: int = MAX_SESSIONS) -> None:
        self._sessions: OrderedDict[str, ChatSession] = OrderedDict()
        self._max_sessions = max_sessions
        self._lock = RLock()

    def get(self, session_id: str) -> ChatSession | None:
        with self._lock:
            session = self._sessions.get(session_id)

            if session is not None:
                # Touch so eviction removes genuinely idle conversations.
                self._sessions.move_to_end(session_id)

            return session

    def create(
        self,
        entity_type: EntityType,
        entity_id: str,
        session_id: str | None = None,
    ) -> ChatSession:
        session = ChatSession(
            session_id=session_id or uuid.uuid4().hex,
            entity_type=entity_type,
            entity_id=entity_id,
        )

        with self._lock:
            self._sessions[session.session_id] = session
            self._sessions.move_to_end(session.session_id)
            self._evict()

        return session

    def save(self, session: ChatSession) -> None:
        with self._lock:
            self._sessions[session.session_id] = session
            self._sessions.move_to_end(session.session_id)
            self._evict()

    def delete(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def clear(self) -> None:
        """Drop every session. Used by the test scripts."""

        with self._lock:
            self._sessions.clear()

    def count(self) -> int:
        """Number of live sessions, for diagnostics."""

        with self._lock:
            return len(self._sessions)

    def _evict(self) -> None:
        """Discard least-recently-used sessions. Caller must hold the lock."""

        while len(self._sessions) > self._max_sessions:
            self._sessions.popitem(last=False)
