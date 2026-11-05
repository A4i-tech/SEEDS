from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.content_aggregator_requests import (
    ContentAggregatorRefreshRequest,
    ContentAggregatorRegisterRequest,
    ContentAggregatorRegisterResponse,
    ContentAggregatorTokenRequest,
)
from app.models.responses.login import AggregatorTokenResponse
from app.platform.auth.dependencies import get_db
from app.platform.auth.rate_limit import check_rate_limit
from app.platform.error_handling import AppError
from app.platform.settings import Settings, get_settings
from app.services.content_aggregator.auth import ContentAggregatorAuth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/auth", tags=["Content Aggregator Auth"])


def get_content_aggregator_auth(
    db: AsyncDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ContentAggregatorAuth:
    return ContentAggregatorAuth(db, settings)


def _set_no_store_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


@router.post("/token", summary="Exchange client_id/client_secret for a JWT")
async def issue_token(
    response: Response,
    body: ContentAggregatorTokenRequest,
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> AggregatorTokenResponse:
    if not check_rate_limit(f"token:{body.client_id}"):
        logger.warning("content_aggregator auth: rate limited client_id=%s", body.client_id)
        raise AppError("RATE_LIMITED", "Too many token requests for this client_id.", 429)
    result = await auth.issue_token(
        client_id=body.client_id,
        client_secret=body.client_secret,
    )
    _set_no_store_headers(response)
    return result


@router.post("/token/refresh", summary="Exchange a refresh token for a new access token")
async def refresh_token(
    response: Response,
    body: ContentAggregatorRefreshRequest,
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> AggregatorTokenResponse:
    result = await auth.refresh_token(refresh_token=body.refresh_token)
    _set_no_store_headers(response)
    return result


@router.post("/register", summary="Register a new integration client")
async def register_client(
    body: ContentAggregatorRegisterRequest,
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> ContentAggregatorRegisterResponse:
    client_id, client_secret = await auth.register_client(
        name=body.name,
        tenant_ids=body.tenant_ids,
        scopes=body.scopes,
        created_by="",
    )
    return ContentAggregatorRegisterResponse(
        client_id=client_id,
        client_secret=client_secret,
        tenant_ids=body.tenant_ids,
        allowed_scopes=body.scopes,
    )
