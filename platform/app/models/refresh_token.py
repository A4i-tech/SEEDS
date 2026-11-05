from __future__ import annotations

from typing import TypedDict


class UserClaims(TypedDict):
    role: str
    tenant_id: str
    school_id: str
