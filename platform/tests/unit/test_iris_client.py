from __future__ import annotations

import json
import logging

import httpx
import pytest
from pydantic import ValidationError

from app.aggregators.iris_types import IrisConfig
from app.platform.settings import Settings
from app.providers import iris_client
from app.providers.iris_client import IrisClient, get_iris_client, parse_iris_json

_BOOK_DETAILS = json.dumps({"1": {"name": "Book One", "desc": "d"}})


def _config(mobile: str = "m", password: str = "p") -> IrisConfig:
    return IrisConfig(base_url="https://iris.test/api", mobile=mobile, password=password)


def _client_with(handler) -> IrisClient:
    c = IrisClient(_config())
    c._http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return c


def _login() -> httpx.Response:
    return httpx.Response(200, json={"accessToken": "JWT.abc", "aid": "286", "cc_id": "15"})


@pytest.mark.asyncio
async def test_login_sends_form_and_caches_raw_jwt():
    seen = {"logins": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["logins"] += 1
        assert b"ph=" in req.content and b"pw=" in req.content
        return _login()

    c = _client_with(handler)
    assert await c.get_session() == "JWT.abc"
    await c.get_session()
    assert seen["logins"] == 1


@pytest.mark.asyncio
async def test_requests_send_raw_jwt_header():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("login.php"):
            return _login()
        assert req.headers["authorization"] == "JWT.abc"
        return httpx.Response(200, json={"status": "success", "data": {"books": []}})

    assert await _client_with(handler).list_books() == []


@pytest.mark.asyncio
async def test_list_books_uses_cc_id_and_never_calls_get_all_books():
    paths: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        paths.append(req.url.path)
        if req.url.path.endswith("login.php"):
            return _login()
        assert req.url.params["id"] == "15"
        body = {"bookid": "101", "book_details": _BOOK_DETAILS, "tactiles": {"22": ["1"], "25": ["1", "3"]}}
        return httpx.Response(200, json={"status": "success", "data": {"books": [body]}})

    books = await _client_with(handler).list_books()
    assert not any(p.endswith("getAllBooks.php") for p in paths)
    assert books[0].book_id == "101"
    assert books[0].name == "Book One"
    assert books[0].tactile_ids == ["22", "25"]


@pytest.mark.asyncio
async def test_list_books_book_without_tactiles_has_empty_ids():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("login.php"):
            return _login()
        body = {"bookid": "102", "book_details": _BOOK_DETAILS, "tactiles": []}
        return httpx.Response(200, json={"status": "success", "data": {"books": [body]}})

    books = await _client_with(handler).list_books()
    assert books[0].tactile_ids == []


def _tactile_handler(req: httpx.Request) -> httpx.Response:
    if req.url.path.endswith("login.php"):
        return _login()
    if req.url.path.endswith("viewTactiles.php"):
        assert req.url.params["bookid"] == "101"
        assert req.url.params["type"] == "1"
        variant = {"title_english": "T", "title": "T", "content": {"name_1": "a", "desc_1": "b"},
                   "author_id": "9", "is_poster": "0"}
        return httpx.Response(200, json={"22": [{"1": variant}, {"3": variant}], "25": [{"1": variant}]})
    lang = req.url.params["language"]
    assert req.url.params["id"] == "286"
    paths = [f"https://cdn.example/101/22/{lang}/1/desc.mp3", f"https://cdn.example/101/25/{lang}/1/desc.mp3"]
    return httpx.Response(200, json={"success": True, "tactiles": [{"paths": paths}]})


@pytest.mark.asyncio
async def test_list_tactiles_flattens_variants_and_attaches_audio_urls():
    c = _client_with(_tactile_handler)
    tactiles = await c.list_tactiles("101")
    assert [(t.tactile_id, t.language_id) for t in tactiles] == [("22", "1"), ("22", "3"), ("25", "1")]
    assert [str(u) for u in tactiles[1].audio_urls] == ["https://cdn.example/101/22/3/1/desc.mp3"]


@pytest.mark.asyncio
async def test_audio_urls_are_per_tactile():
    tactiles = await _client_with(_tactile_handler).list_tactiles("101")
    by_id = {t.tactile_id: t for t in tactiles if t.language_id == "1"}
    assert [str(u) for u in by_id["22"].audio_urls] == ["https://cdn.example/101/22/1/1/desc.mp3"]
    assert [str(u) for u in by_id["25"].audio_urls] == ["https://cdn.example/101/25/1/1/desc.mp3"]


@pytest.mark.asyncio
async def test_download_missing_tactiles_key_raises():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("login.php"):
            return _login()
        if req.url.path.endswith("viewTactiles.php"):
            v = {"title_english": "T", "title": "T", "content": {}, "author_id": "9", "is_poster": "0"}
            return httpx.Response(200, json={"22": [{"1": v}]})
        return httpx.Response(200, json={"success": False})

    with pytest.raises(KeyError):
        await _client_with(handler).list_tactiles("101")


def test_parse_iris_json_skips_php_warnings():
    assert parse_iris_json('<br />\n<b>Warning</b>: x<br />\n{"a": 1}') == {"a": 1}


def test_parse_iris_json_raises_without_body():
    with pytest.raises(RuntimeError):
        parse_iris_json("<br />\n<b>Warning</b>: x")


def test_parse_iris_json_raises_on_malformed_body_after_warnings():
    with pytest.raises(ValueError):
        parse_iris_json('<br />\n{"a": ')


def test_stripped_php_warnings_are_logged(caplog):
    with caplog.at_level(logging.WARNING):
        parse_iris_json('<br />\n<b>Warning</b>: x<br />\n{"a": 1}')
    assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 1


@pytest.mark.asyncio
async def test_login_without_token_raises():
    c = _client_with(lambda req: httpx.Response(200, json={"error": False}))
    with pytest.raises(ValidationError):
        await c.get_session()


@pytest.mark.asyncio
async def test_login_error_text_has_no_secrets():
    c = IrisClient(_config("9717503152", "s3cretpw"))
    c._http = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json={"error": False, "echo": "x"}))
    )
    with pytest.raises(ValidationError) as exc:
        await c.get_session()
    text = str(exc.value)
    assert "s3cretpw" not in text and "9717503152" not in text and "JWT" not in text


@pytest.mark.asyncio
async def test_requests_use_params_not_url_building():
    seen: dict[str, str] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("login.php"):
            return _login()
        seen["bookid"] = req.url.params["bookid"]
        return httpx.Response(200, json={})

    await _client_with(handler).list_tactiles("1&x=2")
    assert seen["bookid"] == "1&x=2"


@pytest.mark.parametrize(
    "overrides",
    [
        {"iris_mobile": "", "iris_password": "p"},
        {"iris_mobile": "m", "iris_password": ""},
        {"iris_mobile": "m", "iris_password": "p", "iris_base_url": "http://vembi.in/x"},
    ],
)
def test_client_requires_credentials_and_https(monkeypatch, overrides):
    get_iris_client.cache_clear()
    monkeypatch.setattr(iris_client, "get_settings", lambda: Settings(**overrides))
    with pytest.raises(ValidationError):
        get_iris_client()
    get_iris_client.cache_clear()
