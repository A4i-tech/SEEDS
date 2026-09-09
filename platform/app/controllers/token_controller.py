from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from app.models.responses.login import TokenResponse
from app.platform.auth.dependencies import (
    REFRESH_COOKIE_NAME,
    clear_refresh_cookie,
    set_refresh_cookie,
)
from app.platform.error_handling import AppError, UnauthorizedError
from app.services.auth_service import AuthService, get_auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/token/refresh", summary="Exchange a refresh token for a new access token")
async def refresh_token(
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise UnauthorizedError("Missing refresh token")
    try:
        result = await service.refresh(token)
    except (UnauthorizedError, AppError):
        clear_refresh_cookie(response)
        raise
    set_refresh_cookie(response, result["refresh_token"])
    return TokenResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result["expires_in"],
        token_type=result.get("token_type", "Bearer"),
    )
