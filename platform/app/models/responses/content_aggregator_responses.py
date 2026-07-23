"""Response schemas for the Content Aggregator partner auth endpoint."""
from __future__ import annotations

from pydantic import BaseModel


class ContentAggregatorTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "Bearer"
