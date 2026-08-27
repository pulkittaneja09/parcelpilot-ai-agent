"""Server-side authentication and authorisation, enforced at the data layer.

Two separate questions, in order:

1. *Who is calling?* — :func:`authenticate` resolves the ``X-User-ID`` header
   against the server-side demo directory in :mod:`app.config.demo_users`.
2. *May they read this record?* — :func:`authorise_entity_access` resolves the
   record's owning account **from the database** and checks it against that
   user's role and scope.

The client never asserts its own permissions. ``X-Account-ID`` is not consulted:
a caller typing another customer's ticket id is refused because ownership comes
from ``tickets.account_id`` / ``orders.account_id``, not from the request.

The check runs before protected context is loaded, before vector retrieval, and
before the model call, so a denied request reads no row, retrieves nothing, and
spends no tokens. A prompt instruction can be talked around; a raised exception
cannot.
"""

from __future__ import annotations

from app.config.demo_users import DEFAULT_USER_ID, DemoUser, get_user
from app.errors import (
    AccountAccessDeniedError,
    EntityNotFoundError,
    UnknownUserError,
)
from app.models.chat import EntityType
from app.services.context_service import get_order_context, get_ticket_context


#: Header carrying the mocked caller identity.
USER_HEADER = "X-User-ID"

#: Returned by the tool layer when a lookup is refused. Carries no record data.
ACCESS_DENIED = "ACCESS_DENIED"


def authenticate(user_id: str | None) -> DemoUser:
    """Resolve the caller from ``X-User-ID``.

    An absent header falls back to the least-privileged demo user, so an
    unauthenticated request can never see more than the most restricted staff
    member. An id that is present but unrecognised is rejected outright rather
    than silently downgraded.

    Raises:
        UnknownUserError: the header names a user that does not exist.
    """

    if user_id is None or not user_id.strip():
        user = get_user(DEFAULT_USER_ID)

        # DEFAULT_USER_ID is a module constant, so this cannot fail in practice.
        if user is None:  # pragma: no cover - guards a misconfigured directory
            raise UnknownUserError(DEFAULT_USER_ID)

        return user

    user = get_user(user_id)

    if user is None:
        raise UnknownUserError(user_id.strip())

    return user


def resolve_entity_account(entity_type: EntityType, entity_id: str) -> str | None:
    """Return the account id that owns a ticket or order, per the database.

    This is the value authorisation is decided on. It comes from the operational
    row, never from the request.

    Raises:
        EntityNotFoundError: the record does not exist.
    """

    if entity_type == "ticket":
        context = get_ticket_context(entity_id)
    elif entity_type == "order":
        context = get_order_context(entity_id)
    else:
        raise ValueError(f"Unsupported entity type: {entity_type!r}")

    if not context:
        raise EntityNotFoundError(entity_type, entity_id)

    record = context.get(entity_type) or {}

    return record.get("account_id")


def denial_message(user: DemoUser) -> str:
    """The safe refusal shown to an unauthorised caller.

    Names the caller's own role and scope, never the record's owner — telling an
    unauthorised user which customer owns a record is itself a disclosure.
    """

    return (
        "Access denied. Your current role/account scope does not permit access "
        f"to this record. You are signed in as {user.display_name} "
        f"(role: {user.role}, scope: {user.scope_description()})."
    )


def authorise_entity_access(
    entity_type: EntityType,
    entity_id: str,
    user: DemoUser,
) -> str | None:
    """Confirm ``user`` may read this record, and return its owning account.

    Raises:
        EntityNotFoundError: the record does not exist.
        AccountAccessDeniedError: the record belongs to an account outside this
            user's scope.
    """

    owner_account_id = resolve_entity_account(entity_type, entity_id)

    if not user.may_access_account(owner_account_id):
        raise AccountAccessDeniedError(
            entity_type,
            entity_id,
            reason=denial_message(user),
        )

    return owner_account_id


def authorise_account_access(account_id: str, user: DemoUser) -> None:
    """Confirm ``user`` may read account-level data for ``account_id``.

    Raises:
        AccountAccessDeniedError: the account is outside this user's scope.
    """

    if not user.may_access_account(account_id):
        raise AccountAccessDeniedError(
            "account",
            account_id,
            reason=denial_message(user),
        )
