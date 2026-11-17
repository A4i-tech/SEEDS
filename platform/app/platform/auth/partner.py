from __future__ import annotations

import math
import time
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import OAuth2PasswordBearer
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import PartnerAccess
from app.models.requests.integration_headers import TenantIdsHeader
from app.platform.auth.dependencies import get_db
from app.platform.authz.audit import log_denial
from app.platform.error_handling import AppError, RateLimitedError
from app.platform.settings import Settings, get_settings
from app.platform.telemetry import get_counter
from app.services.content_aggregator._jwt import decode_access_token
from app.services.content_aggregator.auth import ContentAggregatorAuth

_partner_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token")
_limiter = MovingWindowRateLimiter(MemoryStorage())


def require_partner(scope: str, *, single: bool = True) -> Callable[..., Awaitable[PartnerAccess]]:
    async def _check(
        x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
        token: str = Depends(_partner_oauth2_scheme),
        settings: Settings = Depends(get_settings),
        db: AsyncDatabase = Depends(get_db),
    ) -> PartnerAccess:
        client_id = ""
        try:
            claims = decode_access_token(token, secret_key=settings.secret_key)
            client_id = claims["sub"]
            client = await ContentAggregatorAuth(db, settings).get_active_client(client_id)
            for rate, key in (
                (parse(settings.content_aggregator_client_rate_limit), client_id),
                (parse(settings.content_aggregator_global_rate_limit), "global"),
            ):
                if not _limiter.hit(rate, "partner", key):
                    reset_time = _limiter.get_window_stats(rate, "partner", key).reset_time
                    raise RateLimitedError(max(math.ceil(reset_time - time.time()), 1))
            if scope not in claims["scopes"] or scope not in client.allowed_scopes:
                raise AppError("SCOPE_INSUFFICIENT", f"scope '{scope}' required", 403)
            header = TenantIdsHeader.model_validate(
                {"ids": x_tenant_ids},
                context={"allowed": set(claims["tenant_ids"]) & set(client.tenant_ids), "single": single},
            )
        except AppError as exc:
            get_counter("auth.failures").add(1, {"reason": exc.code.lower()})
            log_denial(
                user_id=client_id,
                resource=f"tenants:{x_tenant_ids}",
                action=scope,
                reason=exc.code.lower(),
            )
            raise
        return PartnerAccess(client_id=client_id, tenant_ids=header.ids)

    return _check
