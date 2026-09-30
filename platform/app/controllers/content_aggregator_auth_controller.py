from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.content_aggregator_requests import (
    ContentAggregatorRefreshRequest,
    ContentAggregatorRegisterRequest,
    ContentAggregatorRegisterResponse,
    ContentAggregatorTokenRequest,
)
from app.models.responses.login import AggregatorTokenResponse
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings, get_settings
from app.services.content_aggregator.auth import ContentAggregatorAuth

router = APIRouter(prefix="/v1/auth", tags=["Content Aggregator Auth"])


def get_content_aggregator_auth(
    db: AsyncDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ContentAggregatorAuth:
    return ContentAggregatorAuth(db, settings)


def _oauth_error(error: str, description: str, status_code: int) -> JSONResponse:
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    if status_code == 401:
        headers["WWW-Authenticate"] = "Bearer"
    return JSONResponse(
        status_code=status_code,
        content={"error": error, "error_description": description},
        headers=headers,
    )


@router.post("/token", summary="Exchange client_id/client_secret for a JWT", response_model=None)
async def issue_token(
    response: Response,
    body: ContentAggregatorTokenRequest = Depends(ContentAggregatorTokenRequest.as_form),
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> AggregatorTokenResponse | JSONResponse:
    try:
        result = await auth.issue_token(
            client_id=body.client_id,
            client_secret=body.client_secret,
            scopes=body.scope.split(),
        )
    except UnauthorizedError as exc:
        return _oauth_error("invalid_client", str(exc), 401)
    except AppError as exc:
        error = "invalid_scope" if exc.code == "SCOPE_INSUFFICIENT" else "invalid_client"
        return _oauth_error(error, exc.message, exc.status_code)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return AggregatorTokenResponse.model_validate(result)


@router.post(
    "/token/refresh", summary="Exchange a refresh token for a new access token", response_model=None
)
async def refresh_token(
    response: Response,
    body: ContentAggregatorRefreshRequest,
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> AggregatorTokenResponse | JSONResponse:
    try:
        result = await auth.refresh_token(refresh_token=body.refresh_token)
    except UnauthorizedError as exc:
        return _oauth_error("invalid_grant", str(exc), 401)
    except AppError as exc:
        error = "invalid_grant" if exc.code == "REFRESH_TOKEN_EXPIRED" else "invalid_client"
        return _oauth_error(error, exc.message, exc.status_code)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return AggregatorTokenResponse.model_validate(result)


@router.post("/register", summary="Register a new integration client")
async def register_client(
    body: ContentAggregatorRegisterRequest,
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> ContentAggregatorRegisterResponse:
    client_id, client_secret = await auth.register_client(
        name=body.name, tenant_ids=body.tenant_ids, scopes=body.scopes
    )
    return ContentAggregatorRegisterResponse(
        client_id=client_id,
        client_secret=client_secret,
        tenant_ids=body.tenant_ids,
        allowed_scopes=body.scopes,
    )
