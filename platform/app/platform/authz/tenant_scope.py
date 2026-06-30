"""
Tenant-scope authorization guard.

Every service method that accesses tenant-scoped resources must call
assert_same_tenant() before reading or writing data.

SECURITY:
  - Superadmin bypass hook is provided for future use.
  - Denial is logged via audit.log_denial before ForbiddenError is raised.
"""

from __future__ import annotations

import logging
from typing import Any

from app.platform.authz.audit import log_denial
from app.platform.error_handling import ForbiddenError

logger = logging.getLogger(__name__)

# Future-proof: roles that bypass tenant scoping (e.g. platform superadmin).
_BYPASS_ROLES: frozenset[str] = frozenset()


def assert_same_tenant(
    current_user: dict[str, Any],
    resource_tenant_id: str,
) -> None:
    """
    Assert that *current_user* belongs to *resource_tenant_id*.

    Pass-through for any role listed in _BYPASS_ROLES (reserved for superadmin).

    Raises ForbiddenError when the tenant IDs do not match.
    """
    role: str = current_user.get("role", "")
    if role in _BYPASS_ROLES:
        return

    caller_tenant: str = current_user.get("tenant_id", "") or ""
    # Tenant-role users: their own ID *is* the tenant_id
    if role == "tenant":
        caller_tenant = caller_tenant or current_user.get("sub", "")

    if caller_tenant != resource_tenant_id:
        user_id = current_user.get("sub", "unknown")
        log_denial(
            user_id=user_id,
            resource=f"tenant:{resource_tenant_id}",
            action="access",
            reason="tenant_mismatch",
        )
        raise ForbiddenError("tenant access denied")
