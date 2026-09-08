from __future__ import annotations

import httpx
import pytest

from app.providers.hexis_client import HexisClient


def _client_with(handler) -> HexisClient:
    c = HexisClient()
    c._http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return c


@pytest.mark.asyncio
async def test_login_sends_form_and_caches_raw_jwt():
    seen = {"logins": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("login.php"):
            seen["logins"] += 1
            assert b"ph=" in req.content and b"pw=" in req.content
            return httpx.Response(200, json={"accessToken": "JWT.abc", "aid": "286"})
        return httpx.Response(200, json=[])

    c = _client_with(handler)
    assert await c.get_session() == "JWT.abc"
    await c.get_session()
    assert seen["logins"] == 1


@pytest.mark.asyncio
async def test_list_content_sends_raw_jwt_header():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("login.php"):
            return httpx.Response(200, json={"accessToken": "JWT.abc"})
        assert req.headers["authorization"] == "JWT.abc"
        return httpx.Response(200, json=[{"cid": "15950", "title": "NEWS WEEK 16"}])

    c = _client_with(handler)
    items = await c.list_content("286")
    assert items == [{"cid": "15950", "title": "NEWS WEEK 16"}]


@pytest.mark.asyncio
async def test_get_subjects_maps_id_to_name():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("login.php"):
            return httpx.Response(200, json={"accessToken": "JWT.abc"})
        return httpx.Response(200, json={"subjects": [{"id": "3", "subject": "Science"}, {"id": "6", "subject": "Mathematics"}]})

    c = _client_with(handler)
    assert await c.get_subjects() == {"3": "Science", "6": "Mathematics"}


@pytest.mark.asyncio
async def test_login_failure_raises_on_html_error_body():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<br /><b>Warning</b>: INVALID_TOKEN")

    c = _client_with(handler)
    with pytest.raises(RuntimeError, match="Hexis login failed"):
        await c.get_session()
