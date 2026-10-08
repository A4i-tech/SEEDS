"""Coverage for app.providers.subodha_client (SubodhaClient, _with_retry, _extract_video_data)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

import app.providers.subodha_client as subodha_client_module
from app.providers.subodha_client import (
    SubodhaClient,
    _extract_video_data,
    _with_retry,
    close_subodha_client,
    get_subodha_client,
)


class _FakeCookie:
    def __init__(self, name: str, value: str) -> None:
        self.name = name
        self.value = value


class _FakeCookies:
    def __init__(self, jar=None) -> None:
        self.jar = jar or []


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, headers=None, cookie_jar=None, text="", content=b""):
        self.status_code = status_code
        self._json = json_data
        self.headers = headers or {}
        self.cookies = _FakeCookies(cookie_jar)
        self.text = text
        self.content = content

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=httpx.Request("GET", "http://x"), response=self)


def _make_settings(**overrides):
    base = {
        "subodha_base_url": "https://lms.example.com",
        "subodha_username": "user1",
        "subodha_password": "pass1",
        "subodha_page_size": 50,
        "subodha_page_delay_ms": 0,
        "subodha_xblock_concurrency": 2,
        "subodha_xblock_delay_ms": 0,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _make_client(settings=None):
    settings = settings or _make_settings()
    with patch("app.providers.subodha_client.get_settings", return_value=settings):
        return SubodhaClient()


class TestExtractVideoData:
    def test_returns_none_when_no_metadata_tag(self) -> None:
        assert _extract_video_data("<div>no metadata</div>") is None

    def test_returns_none_on_invalid_json(self) -> None:
        html = '<div data-metadata="not-json"></div>'
        assert _extract_video_data(html) is None

    def test_extracts_fields_from_valid_metadata(self) -> None:
        meta = {
            "sources": ["a.mp4"],
            "streams": "0.75:abc",
            "poster": "poster.jpg",
            "transcriptLanguages": {"en": "English"},
        }
        html = f'<div data-metadata=\'{json.dumps(meta)}\'></div>'
        result = _extract_video_data(html)
        assert result == {
            "sources": ["a.mp4"],
            "streams": "0.75:abc",
            "poster": "poster.jpg",
            "transcriptLanguages": {"en": "English"},
        }

    def test_missing_optional_fields_default_sensibly(self) -> None:
        html = '<div data-metadata=\'{}\'></div>'
        result = _extract_video_data(html)
        assert result == {"sources": [], "streams": None, "poster": None, "transcriptLanguages": {}}


class TestWithRetry:
    async def test_returns_result_on_first_success(self) -> None:
        fn = AsyncMock(return_value="ok")
        result = await _with_retry(fn, label="test")
        assert result == "ok"
        fn.assert_awaited_once()

    async def test_retries_on_429_then_succeeds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sleeps = []
        monkeypatch.setattr(subodha_client_module.asyncio, "sleep", AsyncMock(side_effect=lambda s: sleeps.append(s)))

        resp = _FakeResponse(status_code=429, headers={"retry-after": "2"})
        err = httpx.HTTPStatusError("429", request=httpx.Request("GET", "http://x"), response=resp)
        fn = AsyncMock(side_effect=[err, "ok"])

        result = await _with_retry(fn, label="courses", retries=3, base_delay=5.0)

        assert result == "ok"
        assert sleeps == [2]

    async def test_retries_on_503_without_retry_after_uses_base_delay(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sleeps = []
        monkeypatch.setattr(subodha_client_module.asyncio, "sleep", AsyncMock(side_effect=lambda s: sleeps.append(s)))

        resp = _FakeResponse(status_code=503, headers={})
        err = httpx.HTTPStatusError("503", request=httpx.Request("GET", "http://x"), response=resp)
        fn = AsyncMock(side_effect=[err, "ok"])

        result = await _with_retry(fn, label="courses", retries=3, base_delay=5.0)

        assert result == "ok"
        assert sleeps == [5.0]

    async def test_non_retryable_status_raises_immediately(self) -> None:
        resp = _FakeResponse(status_code=500, headers={})
        err = httpx.HTTPStatusError("500", request=httpx.Request("GET", "http://x"), response=resp)
        fn = AsyncMock(side_effect=err)

        with pytest.raises(httpx.HTTPStatusError):
            await _with_retry(fn, label="courses")
        fn.assert_awaited_once()

    async def test_retries_on_transport_error_then_succeeds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sleeps = []
        monkeypatch.setattr(subodha_client_module.asyncio, "sleep", AsyncMock(side_effect=lambda s: sleeps.append(s)))

        fn = AsyncMock(side_effect=[httpx.ConnectError("boom"), "ok"])

        result = await _with_retry(fn, label="courses", retries=3, base_delay=1.0)

        assert result == "ok"
        assert sleeps == [1.0]

    async def test_exhausts_retries_and_raises_runtime_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(subodha_client_module.asyncio, "sleep", AsyncMock())
        fn = AsyncMock(side_effect=httpx.ConnectError("boom"))

        with pytest.raises(RuntimeError, match="failed after 2 retries"):
            await _with_retry(fn, label="courses", retries=2, base_delay=0.1)
        assert fn.await_count == 2


class TestSubodhaClientInit:
    def test_base_url_from_settings(self) -> None:
        client = _make_client(_make_settings(subodha_base_url="https://custom.example.com"))
        assert client._base_url == "https://custom.example.com"
        assert client._session_cookie is None
        assert client._session_expires_at is None

    async def test_aclose_closes_http_client(self) -> None:
        client = _make_client()
        client._http.aclose = AsyncMock()
        await client.aclose()
        client._http.aclose.assert_awaited_once()

    def test_clear_session_cache_resets_state(self) -> None:
        client = _make_client()
        client._session_cookie = "abc"
        client._session_expires_at = datetime.now(UTC)
        client._http.cookies.clear = MagicMock()

        client.clear_session_cache()

        assert client._session_cookie is None
        assert client._session_expires_at is None
        client._http.cookies.clear.assert_called_once()


class TestGetSession:
    async def test_reuses_cached_session_when_not_near_expiry(self) -> None:
        client = _make_client()
        client._session_cookie = "cached-cookie"
        client._session_expires_at = datetime.now(UTC) + timedelta(days=1)
        client._http.get = AsyncMock()

        result = await client.get_session()

        assert result == "cached-cookie"
        client._http.get.assert_not_called()

    async def test_logs_in_when_no_cached_session(self) -> None:
        client = _make_client()
        init_resp = _FakeResponse(status_code=200, cookie_jar=[_FakeCookie("csrftoken", "tok123")])
        login_resp = _FakeResponse(
            status_code=200,
            json_data={"success": True},
            headers={"content-type": "application/json"},
            cookie_jar=[_FakeCookie("sessionid", "sess456")],
        )
        client._http.get = AsyncMock(return_value=init_resp)
        client._http.post = AsyncMock(return_value=login_resp)

        result = await client.get_session()

        assert "csrftoken=tok123" in result
        assert "sessionid=sess456" in result
        assert client._session_expires_at is not None

    async def test_logs_in_when_cached_session_near_expiry(self) -> None:
        client = _make_client()
        client._session_cookie = "stale"
        client._session_expires_at = datetime.now(UTC) + timedelta(minutes=5)
        init_resp = _FakeResponse(status_code=200, cookie_jar=[])
        login_resp = _FakeResponse(
            status_code=200,
            json_data={"success": True},
            headers={"content-type": "application/json"},
            cookie_jar=[_FakeCookie("sessionid", "fresh")],
        )
        client._http.get = AsyncMock(return_value=init_resp)
        client._http.post = AsyncMock(return_value=login_resp)

        result = await client.get_session()

        assert "sessionid=fresh" in result

    async def test_login_failure_raises_runtime_error(self) -> None:
        client = _make_client()
        init_resp = _FakeResponse(status_code=200, cookie_jar=[])
        login_resp = _FakeResponse(
            status_code=401,
            json_data={"success": False, "error": "bad creds"},
            headers={"content-type": "application/json"},
            cookie_jar=[],
        )
        client._http.get = AsyncMock(return_value=init_resp)
        client._http.post = AsyncMock(return_value=login_resp)

        with pytest.raises(RuntimeError, match="Subodha login failed"):
            await client.get_session()

    async def test_login_non_json_response_treated_as_failure(self) -> None:
        client = _make_client()
        init_resp = _FakeResponse(status_code=200, cookie_jar=[])
        login_resp = _FakeResponse(status_code=200, headers={"content-type": "text/html"}, cookie_jar=[])
        client._http.get = AsyncMock(return_value=init_resp)
        client._http.post = AsyncMock(return_value=login_resp)

        with pytest.raises(RuntimeError, match="Subodha login failed"):
            await client.get_session()


class TestListAllCourses:
    async def test_paginates_until_no_next_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _make_client()
        monkeypatch.setattr(subodha_client_module.asyncio, "sleep", AsyncMock())

        page1 = _FakeResponse(
            status_code=200,
            json_data={"results": [{"id": "c1"}], "pagination": {"next": "page2-url"}},
        )
        page2 = _FakeResponse(status_code=200, json_data={"results": [{"id": "c2"}], "pagination": {}})
        client._http.get = AsyncMock(side_effect=[page1, page2])

        courses = await client.list_all_courses()

        assert [c["id"] for c in courses] == ["c1", "c2"]
        assert client._http.get.await_count == 2

    async def test_single_page_returns_all_results(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _make_client()
        monkeypatch.setattr(subodha_client_module.asyncio, "sleep", AsyncMock())

        page1 = _FakeResponse(status_code=200, json_data={"results": [{"id": "only"}], "pagination": {}})
        client._http.get = AsyncMock(return_value=page1)

        courses = await client.list_all_courses()

        assert [c["id"] for c in courses] == ["only"]
        client._http.get.assert_awaited_once()


class TestFetchBlocks:
    async def test_fetch_blocks_returns_parsed_data(self) -> None:
        client = _make_client()
        resp = _FakeResponse(status_code=200, json_data={"blocks": {"b1": {}}})
        client._http.get = AsyncMock(return_value=resp)

        result = await client.fetch_blocks("course-1", "session=abc")

        assert result == {"blocks": {"b1": {}}}
        _, kwargs = client._http.get.await_args
        assert kwargs["headers"] == {"Cookie": "session=abc"}
        assert kwargs["params"]["course_id"] == "course-1"


class TestEnrichBlocksWithContent:
    async def test_enriches_video_block(self) -> None:
        client = _make_client()
        meta = {"sources": ["v.mp4"]}
        video_html = f'<div data-metadata=\'{json.dumps(meta)}\'></div>'
        resp = _FakeResponse(status_code=200, text=video_html)
        client._http.get = AsyncMock(return_value=resp)

        blocks_response = {
            "blocks": {
                "b1": {"id": "b1", "type": "video", "student_view_url": "https://x/b1"},
            }
        }

        result = await client.enrich_blocks_with_content(blocks_response, "session=abc")

        block = result["blocks"]["b1"]
        assert block["student_view_html"] == ""
        assert block["student_view_data"]["sources"] == ["v.mp4"]

    async def test_enriches_html_block_strips_staff_debug(self) -> None:
        client = _make_client()
        raw = (
            '<div class="xblock"><p>Lesson</p>'
            '<div class="wrap-instructor-info">debug</div></div>'
        )
        resp = _FakeResponse(status_code=200, text=raw)
        client._http.get = AsyncMock(return_value=resp)

        blocks_response = {
            "blocks": {
                "b1": {"id": "b1", "type": "html", "student_view_url": "https://x/b1"},
            }
        }

        result = await client.enrich_blocks_with_content(blocks_response, "session=abc")

        block = result["blocks"]["b1"]
        assert "Lesson" in block["student_view_html"]
        assert "wrap-instructor-info" not in block["student_view_html"]
        assert block["student_view_data"] is None

    async def test_skips_blocks_without_student_view_url(self) -> None:
        client = _make_client()
        client._http.get = AsyncMock()

        blocks_response = {"blocks": {"b1": {"id": "b1", "type": "html"}}}

        result = await client.enrich_blocks_with_content(blocks_response, "session=abc")

        client._http.get.assert_not_called()
        assert result["blocks"]["b1"] == {"id": "b1", "type": "html"}

    async def test_skips_blocks_with_unsupported_type(self) -> None:
        client = _make_client()
        client._http.get = AsyncMock()

        blocks_response = {"blocks": {"b1": {"id": "b1", "type": "other", "student_view_url": "https://x/b1"}}}

        await client.enrich_blocks_with_content(blocks_response, "session=abc")

        client._http.get.assert_not_called()

    async def test_raises_when_any_block_fails(self) -> None:
        client = _make_client()
        client._http.get = AsyncMock(side_effect=RuntimeError("network down"))

        blocks_response = {
            "blocks": {
                "b1": {"id": "b1", "type": "html", "student_view_url": "https://x/b1"},
            }
        }

        with pytest.raises(RuntimeError, match="xblocks failed to enrich"):
            await client.enrich_blocks_with_content(blocks_response, "session=abc")

    async def test_partial_failure_still_reports_all_failures(self) -> None:
        client = _make_client()
        ok_resp = _FakeResponse(status_code=200, text='<div class="xblock"><p>ok</p></div>')

        async def fake_get(url, **kwargs):
            if "b1" in url:
                return ok_resp
            raise RuntimeError("boom-b2")

        client._http.get = AsyncMock(side_effect=fake_get)

        blocks_response = {
            "blocks": {
                "b1": {"id": "b1", "type": "html", "student_view_url": "https://x/b1"},
                "b2": {"id": "b2", "type": "html", "student_view_url": "https://x/b2"},
            }
        }

        with pytest.raises(RuntimeError, match="1/2 xblocks failed"):
            await client.enrich_blocks_with_content(blocks_response, "session=abc")

        assert "ok" in blocks_response["blocks"]["b1"]["student_view_html"]


class TestFetchAsset:
    async def test_fetch_asset_returns_bytes(self) -> None:
        client = _make_client()
        resp = _FakeResponse(status_code=200, content=b"binary-data")
        client._http.get = AsyncMock(return_value=resp)

        result = await client.fetch_asset("/assets/file.png", "session=abc")

        assert result == b"binary-data"
        args, kwargs = client._http.get.await_args
        assert args[0] == "https://lms.example.com/assets/file.png"
        assert kwargs["headers"] == {"Cookie": "session=abc"}

    async def test_fetch_asset_raises_on_http_error(self) -> None:
        client = _make_client()
        resp = _FakeResponse(status_code=404, content=b"")
        client._http.get = AsyncMock(return_value=resp)

        with pytest.raises(httpx.HTTPStatusError):
            await client.fetch_asset("/missing.png", "session=abc")


class TestSingleton:
    def setup_method(self) -> None:
        subodha_client_module._client = None

    def teardown_method(self) -> None:
        subodha_client_module._client = None

    def test_get_subodha_client_returns_singleton(self) -> None:
        with patch("app.providers.subodha_client.get_settings", return_value=_make_settings()):
            c1 = get_subodha_client()
            c2 = get_subodha_client()
        assert c1 is c2

    async def test_close_subodha_client_closes_and_resets(self) -> None:
        with patch("app.providers.subodha_client.get_settings", return_value=_make_settings()):
            client = get_subodha_client()
        client.aclose = AsyncMock()

        await close_subodha_client()

        client.aclose.assert_awaited_once()
        assert subodha_client_module._client is None

    async def test_close_subodha_client_is_noop_when_never_created(self) -> None:
        await close_subodha_client()  # should not raise
        assert subodha_client_module._client is None
