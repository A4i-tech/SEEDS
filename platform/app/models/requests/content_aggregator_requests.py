"""Request schemas for the Content Aggregator partner auth endpoint."""
from __future__ import annotations

from pydantic import BaseModel


class ContentAggregatorTokenRequest(BaseModel):
    client_id: str
    client_secret: str
    tenant_id: str | None = None
    scopes: list[str] | None = None
