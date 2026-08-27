"""Mocked user directory: demo identities, roles, and account scope.

Deliberately static and in-process — a stand-in for an identity provider, not
real authentication. What matters is that the *server* owns this mapping: a
caller presents a user id and nothing else, and the role plus the set of accounts
that user may see are looked up here. Nothing about a caller's permissions is
ever read from the request.

Account scope reuses the seeded account ids in ``storage/sqlite/parcelpilot.db``,
so no data is invented:

    ACCT-001  Northstar Logistics   (Enterprise, premium support)
    ACCT-002  LumenWorks            (Growth)
    ACCT-003  Beacon Retail         (Standard)
    ACCT-004  Axis Labs             (Enterprise)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


#: The roles this demo distinguishes.
Role = Literal["support_agent", "manager", "admin"]

#: Roles that are not restricted to a subset of accounts.
_UNSCOPED_ROLES = frozenset({"manager", "admin"})


@dataclass(frozen=True)
class DemoUser:
    """An authenticated ParcelPilot staff member."""

    user_id: str
    display_name: str
    role: Role
    #: Accounts a support agent may read. Ignored for manager/admin, which see
    #: every seeded account.
    allowed_accounts: frozenset[str] = field(default_factory=frozenset)

    @property
    def has_full_access(self) -> bool:
        """True when the role is not limited to a subset of accounts."""

        return self.role in _UNSCOPED_ROLES

    def may_access_account(self, account_id: str | None) -> bool:
        """Whether this user may read data for ``account_id``.

        Fails closed: a record whose owning account cannot be resolved is denied
        for scoped roles, because unknown ownership is not permission.
        """

        if self.has_full_access:
            return True

        if not account_id:
            return False

        return account_id.strip().upper() in self.allowed_accounts

    def scope_description(self) -> str:
        """Human-readable scope, for denial messages and the UI."""

        if self.has_full_access:
            return "all accounts"

        return ", ".join(sorted(self.allowed_accounts)) or "no accounts"


#: The demo directory. Keys are the ids callers send in ``X-User-ID``.
DEMO_USERS: dict[str, DemoUser] = {
    "support_agent_1": DemoUser(
        user_id="support_agent_1",
        display_name="Support Agent 1",
        role="support_agent",
        allowed_accounts=frozenset({"ACCT-001", "ACCT-003"}),
    ),
    "manager_1": DemoUser(
        user_id="manager_1",
        display_name="Manager 1",
        role="manager",
    ),
    "admin_1": DemoUser(
        user_id="admin_1",
        display_name="Admin 1",
        role="admin",
    ),
}


#: Used when a caller sends no ``X-User-ID`` at all. The least-privileged demo
#: user, so an unauthenticated request can never see more than the most
#: restricted staff member.
DEFAULT_USER_ID = "support_agent_1"


def get_user(user_id: str | None) -> DemoUser | None:
    """Look up a demo user by id, case-insensitively. ``None`` if unknown."""

    if not user_id:
        return None

    return DEMO_USERS.get(user_id.strip().lower())


def list_users() -> list[DemoUser]:
    """Every demo user, for the UI's user switcher."""

    return list(DEMO_USERS.values())
