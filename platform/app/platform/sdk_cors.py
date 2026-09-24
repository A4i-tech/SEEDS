from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import Response

from app.platform.database import get_database
from app.repositories.website_repository import WebsiteRepository

logger = logging.getLogger(__name__)

ALLOWED_METHODS_BY_PATH: dict[str, frozenset[str]] = {
    "/translations": frozenset({"GET"}),
    "/translations/extract": frozenset({"POST"}),
    "/v1/languages": frozenset({"GET"}),
}
_ALLOWED_REQUEST_HEADERS = frozenset({"content-type"})
_PREFLIGHT_MAX_AGE = "600"


def _origin_host(origin: str) -> str | None:
    try:
        parsed = urlparse(origin)
        _ = parsed.port
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    if parsed.username or parsed.password or parsed.path or parsed.params or parsed.query or parsed.fragment:
        return None
    return parsed.hostname.lower()


async def is_registered_site_origin(origin: str) -> bool:
    host = _origin_host(origin)
    if host is None:
        return False
    website = await WebsiteRepository(get_database()).find_by_domain(host)
    return website is not None and website.get("status") == "Active"


def _add_vary_origin(headers: MutableHeaders) -> None:
    existing = headers.get("vary", "")
    tokens = {token.strip().lower() for token in existing.split(",") if token.strip()}
    if "*" in tokens or "origin" in tokens:
        return
    headers["vary"] = f"{existing}, Origin" if existing else "Origin"


class SdkCorsMiddleware:
    def __init__(self, app, is_allowed_origin: Callable[[str], Awaitable[bool]]) -> None:  # noqa: ANN001
        self.app = app
        self._is_allowed_origin = is_allowed_origin

    async def _origin_allowed(self, origin: str) -> bool:
        try:
            return await self._is_allowed_origin(origin)
        except Exception:  # noqa: BLE001
            logger.warning("SDK CORS origin lookup failed; treating the origin as not allowed", exc_info=True)
            return False

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        allowed_methods = ALLOWED_METHODS_BY_PATH.get(scope["path"]) if scope["type"] == "http" else None
        if allowed_methods is None:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if not origin or not await self._origin_allowed(origin):
            await self.app(scope, receive, send)
            return

        requested_method = headers.get("access-control-request-method")
        if scope["method"] == "OPTIONS" and requested_method is not None:
            await self._preflight(headers, origin, requested_method, allowed_methods)(scope, receive, send)
            return

        if scope["method"] not in allowed_methods:
            await self.app(scope, receive, send)
            return

        async def send_with_cors(message) -> None:  # noqa: ANN001
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers["access-control-allow-origin"] = origin
                del response_headers["access-control-allow-credentials"]
                _add_vary_origin(response_headers)
            await send(message)

        await self.app(scope, receive, send_with_cors)

    @staticmethod
    def _preflight(
        headers: Headers, origin: str, requested_method: str, allowed_methods: frozenset[str]
    ) -> Response:
        requested_headers = {
            token.strip().lower()
            for token in headers.get("access-control-request-headers", "").split(",")
            if token.strip()
        }
        if requested_method.upper() not in allowed_methods or not requested_headers <= _ALLOWED_REQUEST_HEADERS:
            return Response("Disallowed CORS request", status_code=400, headers={"vary": "Origin"})
        return Response(
            status_code=204,
            headers={
                "access-control-allow-origin": origin,
                "access-control-allow-methods": ", ".join(sorted(allowed_methods)),
                "access-control-allow-headers": "Content-Type",
                "access-control-max-age": _PREFLIGHT_MAX_AGE,
                "vary": "Origin",
            },
        )
