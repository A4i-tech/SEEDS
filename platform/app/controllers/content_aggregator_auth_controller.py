"""Content Aggregator partner auth routes — /v1/auth/*."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.content_aggregator_requests import ContentAggregatorTokenRequest
from app.models.responses.login import TokenResponse
from app.platform.auth.dependencies import get_db
from app.platform.settings import Settings, get_settings
from app.services.content_aggregator.auth import ContentAggregatorAuth

router = APIRouter(prefix="/v1/auth", tags=["Content Aggregator Auth"])


def get_content_aggregator_auth(
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    settings: Settings = Depends(get_settings),
) -> ContentAggregatorAuth:
    return ContentAggregatorAuth(db, settings)


@router.post("/token", summary="Exchange client_id/client_secret for a JWT")
async def issue_token(
    body: ContentAggregatorTokenRequest,
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> TokenResponse:
    result = await auth.issue_token(
        client_id=body.client_id,
        client_secret=body.client_secret,
        scopes=body.scope.split(),
    )
    return TokenResponse.model_validate(result)


@router.post("/token/refresh", summary="Exchange a refresh token for a new access token")
async def refresh_token(
    refresh_token: Annotated[str, Body(embed=True)],
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> TokenResponse:
    result = await auth.refresh_token(refresh_token)
    return TokenResponse.model_validate(result)
