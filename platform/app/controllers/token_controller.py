from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.models.responses.login import TokenResponse
from app.platform.auth.dependencies import RefreshCookie, set_refresh_cookie
from app.platform.error_handling import UnauthorizedError
from app.services.auth_service import AuthService, get_auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/token/refresh", summary="Exchange a refresh token for a new access token")
async def refresh_token(
    response: Response,
    token: RefreshCookie = "",
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    if not token:
        raise UnauthorizedError("Missing refresh token")
    result = await service.refresh(token)
    set_refresh_cookie(response, result["refresh_token"])
    return TokenResponse(
        access_token=result["access_token"],
        expires_in=result["expires_in"],
        token_type=result["token_type"],
    )
