from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, Response

from app.platform import sdk_cors
from app.platform.sdk_cors import SdkCorsMiddleware, is_registered_site_origin
from app.platform.security import setup_security
from app.repositories.website_repository import WebsiteRepository
from tests.support.mongomock_async import AsyncMongoMockClient

REGISTERED = "https://acme.com"
ADMIN_ORIGIN = "https://admin.example.com"


def _routes(app: FastAPI) -> None:
    @app.get("/translations")
    async def get_translations() -> dict[str, str]:
        return {"k": "v"}

    @app.post("/translations/extract")
    async def extract() -> dict[str, str]:
        return {"status": "accepted"}

    @app.get("/translations/list")
    async def list_translations() -> list[str]:
        return []

    @app.get("/v1/languages")
    async def get_languages() -> list[str]:
        return ["hi"]

    @app.post("/v1/languages")
    async def create_language() -> dict[str, str]:
        return {"status": "created"}

    @app.get("/vary-existing")
    async def vary_existing(response: Response) -> dict[str, str]:
        response.headers["vary"] = "Accept-Encoding"
        return {}


def _client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def _stub_app(is_allowed) -> FastAPI:
    app = FastAPI()
    _routes(app)
    app.add_middleware(SdkCorsMiddleware, is_allowed_origin=is_allowed)
    return app


async def _allow_registered(origin: str) -> bool:
    return origin == REGISTERED


@pytest.fixture
def mock_db(monkeypatch):
    db = AsyncMongoMockClient()["test_seeds"]
    monkeypatch.setattr(sdk_cors, "get_database", lambda: db)
    return db


async def _seed(db, domain: str, status: str = "Active") -> None:
    await WebsiteRepository.ensure_indexes(db)
    await WebsiteRepository(db).create("tenant-1", None, domain, f"site-{domain}", "", status)


async def test_allowed_origin_gets_cors_headers_without_credentials():
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.get("/translations", headers={"origin": REGISTERED})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == REGISTERED
    assert response.headers["vary"] == "Origin"
    assert "access-control-allow-credentials" not in response.headers


async def test_unregistered_origin_gets_no_cors_headers():
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.get("/translations", headers={"origin": "https://evil.example"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


async def test_request_without_origin_is_untouched():
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.get("/translations")

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


async def test_paths_outside_the_sdk_routes_are_never_opened():
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.get("/translations/list", headers={"origin": REGISTERED})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


async def test_preflight_for_the_extract_call():
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.options(
            "/translations/extract",
            headers={
                "origin": REGISTERED,
                "access-control-request-method": "POST",
                "access-control-request-headers": "Content-Type",
            },
        )

    assert response.status_code == 204
    assert response.headers["access-control-allow-origin"] == REGISTERED
    assert response.headers["access-control-allow-methods"] == "POST"
    assert response.headers["access-control-allow-headers"] == "Content-Type"
    assert response.headers["access-control-max-age"] == "600"
    assert response.headers["vary"] == "Origin"
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize(
    "path,method",
    [
        ("/translations", "GET"),
        ("/translations/extract", "POST"),
        ("/v1/languages", "GET"),
    ],
)
async def test_each_sdk_path_allows_only_the_method_the_sdk_needs(path, method):
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.request(method, path, headers={"origin": REGISTERED})
        preflight = await client.options(
            path, headers={"origin": REGISTERED, "access-control-request-method": method}
        )

    assert response.headers["access-control-allow-origin"] == REGISTERED
    assert preflight.status_code == 204
    assert preflight.headers["access-control-allow-methods"] == method


@pytest.mark.parametrize(
    "path,method",
    [
        ("/v1/languages", "POST"),
        ("/translations", "POST"),
        ("/translations", "DELETE"),
        ("/translations/extract", "GET"),
        ("/translations/extract", "PUT"),
        ("/v1/languages", "DELETE"),
    ],
)
async def test_other_methods_on_sdk_paths_are_not_opened(path, method):
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.request(method, path, headers={"origin": REGISTERED})
        preflight = await client.options(
            path, headers={"origin": REGISTERED, "access-control-request-method": method}
        )

    assert "access-control-allow-origin" not in response.headers
    assert preflight.status_code == 400
    assert "access-control-allow-origin" not in preflight.headers
    assert "access-control-allow-methods" not in preflight.headers


async def test_preflight_rejects_request_headers_the_sdk_does_not_send():
    async with _client(_stub_app(_allow_registered)) as client:
        preflight = await client.options(
            "/translations/extract",
            headers={
                "origin": REGISTERED,
                "access-control-request-method": "POST",
                "access-control-request-headers": "Content-Type, Authorization",
            },
        )

    assert preflight.status_code == 400
    assert "access-control-allow-origin" not in preflight.headers


async def test_lookup_failure_fails_closed_without_a_500():
    async def _boom(origin: str) -> bool:
        raise RuntimeError("database unavailable")

    async with _client(_stub_app(_boom)) as client:
        response = await client.get("/translations", headers={"origin": REGISTERED})
        preflight = await client.options(
            "/translations/extract",
            headers={"origin": REGISTERED, "access-control-request-method": "POST"},
        )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
    assert preflight.status_code != 500
    assert "access-control-allow-origin" not in preflight.headers


async def test_uninitialised_database_fails_closed(monkeypatch):
    def _no_database():
        raise RuntimeError("Database not initialised")

    monkeypatch.setattr(sdk_cors, "get_database", _no_database)
    async with _client(_stub_app(is_registered_site_origin)) as client:
        response = await client.get("/translations", headers={"origin": REGISTERED})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


async def test_vary_origin_is_merged_not_duplicated():
    async with _client(_stub_app(_allow_registered)) as client:
        response = await client.get("/vary-existing", headers={"origin": REGISTERED})

    assert "access-control-allow-origin" not in response.headers

    app = FastAPI()

    @app.get("/translations")
    async def with_vary(response: Response) -> dict[str, str]:
        response.headers["vary"] = "Accept-Encoding"
        return {}

    app.add_middleware(SdkCorsMiddleware, is_allowed_origin=_allow_registered)
    async with _client(app) as client:
        merged = await client.get("/translations", headers={"origin": REGISTERED})
    assert merged.headers["vary"] == "Accept-Encoding, Origin"

    already = FastAPI()

    @already.get("/translations")
    async def with_origin_vary(response: Response) -> dict[str, str]:
        response.headers["vary"] = "Origin"
        return {}

    already.add_middleware(SdkCorsMiddleware, is_allowed_origin=_allow_registered)
    async with _client(already) as client:
        unchanged = await client.get("/translations", headers={"origin": REGISTERED})
    assert unchanged.headers["vary"] == "Origin"


async def test_credentials_are_never_enabled_for_sdk_origins():
    app = FastAPI()

    @app.get("/translations")
    async def with_credentials(response: Response) -> dict[str, str]:
        response.headers["access-control-allow-credentials"] = "true"
        return {}

    app.add_middleware(SdkCorsMiddleware, is_allowed_origin=_allow_registered)
    async with _client(app) as client:
        response = await client.get("/translations", headers={"origin": REGISTERED})

    assert response.headers["access-control-allow-origin"] == REGISTERED
    assert "access-control-allow-credentials" not in response.headers


async def test_only_active_registered_websites_are_allowed(mock_db):
    await _seed(mock_db, "acme.com", "Active")
    await _seed(mock_db, "dormant.com", "Inactive")

    assert await is_registered_site_origin("https://acme.com") is True
    assert await is_registered_site_origin("https://dormant.com") is False
    assert await is_registered_site_origin("https://unknown.com") is False


async def test_origin_match_is_exact_host_not_a_wildcard(mock_db):
    await _seed(mock_db, "acme.com")

    assert await is_registered_site_origin("http://acme.com") is True
    assert await is_registered_site_origin("http://ACME.com:8080") is True
    assert await is_registered_site_origin("https://www.acme.com") is False
    assert await is_registered_site_origin("https://evil.acme.com") is False
    assert await is_registered_site_origin("https://acme.com.evil.example") is False


@pytest.mark.parametrize(
    "origin",
    [
        "null",
        "acme.com",
        "ftp://acme.com",
        "chrome-extension://acme.com",
        "file://acme.com",
        "https://",
        "https://acme.com/path",
        "https://acme.com/",
        "https://acme.com?x=1",
        "https://user@acme.com",
        "https://acme.com:notaport",
        "",
    ],
)
async def test_invalid_origins_and_schemes_are_rejected(mock_db, origin):
    await _seed(mock_db, "acme.com")

    assert await is_registered_site_origin(origin) is False


async def test_setup_security_opens_only_registered_origins_on_sdk_paths(mock_db):
    await _seed(mock_db, "acme.com")
    await _seed(mock_db, "dormant.com", "Inactive")
    app = FastAPI()
    _routes(app)
    setup_security(app, SimpleNamespace(env="production", cors_allowed_origins=ADMIN_ORIGIN))

    async with _client(app) as client:
        sdk_call = await client.get("/translations", headers={"origin": "https://acme.com"})
        sdk_preflight = await client.options(
            "/translations/extract",
            headers={
                "origin": "https://acme.com",
                "access-control-request-method": "POST",
                "access-control-request-headers": "content-type",
            },
        )
        other_path = await client.get("/translations/list", headers={"origin": "https://acme.com"})
        inactive = await client.get("/translations", headers={"origin": "https://dormant.com"})
        stranger = await client.get("/translations", headers={"origin": "https://evil.example"})

    assert sdk_call.headers["access-control-allow-origin"] == "https://acme.com"
    assert "access-control-allow-credentials" not in sdk_call.headers
    assert sdk_preflight.status_code == 204
    assert sdk_preflight.headers["access-control-allow-methods"] == "POST"
    assert "access-control-allow-origin" not in other_path.headers
    assert "access-control-allow-origin" not in inactive.headers
    assert "access-control-allow-origin" not in stranger.headers


async def test_setup_security_leaves_the_global_allow_list_unchanged(mock_db):
    await _seed(mock_db, "acme.com")
    app = FastAPI()
    _routes(app)
    setup_security(app, SimpleNamespace(env="production", cors_allowed_origins=ADMIN_ORIGIN))

    async with _client(app) as client:
        admin_elsewhere = await client.get("/translations/list", headers={"origin": ADMIN_ORIGIN})
        admin_on_sdk_path = await client.get("/v1/languages", headers={"origin": ADMIN_ORIGIN})
        admin_write = await client.post("/v1/languages", headers={"origin": ADMIN_ORIGIN})
        registered_write = await client.post("/v1/languages", headers={"origin": "https://acme.com"})

    assert admin_elsewhere.headers["access-control-allow-origin"] == ADMIN_ORIGIN
    assert admin_elsewhere.headers["access-control-allow-credentials"] == "true"
    assert admin_on_sdk_path.headers["access-control-allow-origin"] == ADMIN_ORIGIN
    assert admin_on_sdk_path.headers["access-control-allow-credentials"] == "true"
    assert admin_write.headers["access-control-allow-origin"] == ADMIN_ORIGIN
    assert "access-control-allow-origin" not in registered_write.headers
