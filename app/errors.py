"""Domain errors shared across the ParcelPilot backend.

These exist so the API layer can map *expected* failures (an id that does not
exist, a session reused for the wrong record) onto precise HTTP status codes
without resorting to a blanket ``except Exception`` that would also hide real
bugs behind a 404.
"""


class ParcelPilotError(Exception):
    """Base class for application-level errors raised by this backend."""


class EntityNotFoundError(ParcelPilotError, ValueError):
    """A ticket or order id does not exist in the operational database.

    Also subclasses ``ValueError`` so the original single-turn endpoints and the
    ``scripts/`` harnesses — which catch ``ValueError`` — keep working unchanged.
    """

    def __init__(self, entity_type: str, entity_id: str) -> None:
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(f"{entity_type.capitalize()} {entity_id} not found")


class SessionEntityMismatchError(ParcelPilotError, ValueError):
    """An existing session was reused with a different ticket or order.

    Rejecting the request is what keeps conversation memory scoped: history for
    ``TKT-501`` must never be replayed into a prompt about ``TKT-502`` or
    ``ORD-1001``.
    """

    def __init__(
        self,
        session_id: str,
        expected: tuple[str, str],
        received: tuple[str, str],
    ) -> None:
        self.session_id = session_id
        self.expected = expected
        self.received = received

        super().__init__(
            f"Session {session_id} is bound to "
            f"{expected[0]} {expected[1]} and cannot be reused for "
            f"{received[0]} {received[1]}. Start a new conversation instead."
        )


class ModelRateLimitError(ParcelPilotError):
    """The Anthropic API rejected the request with a rate limit or quota error.

    Kept distinct from a generic failure because it is an expected upstream
    condition with a known remedy (wait, or raise the rate limit), not a bug. The API
    layer maps it to 429 so the UI can say so plainly instead of showing a 500.
    """

    def __init__(self, detail: str, retry_after_seconds: float | None = None) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__(detail)
