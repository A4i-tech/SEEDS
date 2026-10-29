"""Coverage for app.providers.subodha_client (SubodhaClient, _with_retry, _extract_video_data)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest

import app.providers.subodha_client as subodha_client_module
from app.platform.settings import Settings
from app.providers.subodha_client import (
    SubodhaClient,
    _extract_video_data,
    _with_retry,
    close_subodha_client,
    get_subodha_client,
)


def _response(status_code=200, *, json_data=None, text=None, content=None, headers=None, cookies=None):
    header_list = list((headers or {}).items())
    for name, value in (cookies or {}).items():
        header_list.append(("set-cookie", f"{name}={value}; Path=/"))
    kwargs = {}
    if json_data is not None:
        kwargs["json"] = json_data
    elif content is not None:
        kwargs["content"] = content
    elif text is not None:
        kwargs["text"] = text
    return httpx.Response(status_code, headers=header_list, request=httpx.Request("GET", "http://x"), **kwargs)


def _transport(handler) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


def _unexpected_request(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unexpected HTTP request: {request.method} {request.url}")


def _frozen_datetime(now: datetime) -> type[datetime]:
    class _Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return now

    return _Frozen


_BASE_SETTINGS = Settings(
    subodha_base_url="https://lms.example.com",
    subodha_username="user1",
    subodha_password="pass1",
    subodha_page_size=50,
    subodha_page_delay_ms=0,
    subodha_xblock_concurrency=2,
    subodha_xblock_delay_ms=0,
)


def _make_settings(**overrides):
    return _BASE_SETTINGS.model_copy(update=overrides)


def _make_client(settings=None, transport=None):
    if settings is None:
        settings = _make_settings()
    with patch("app.providers.subodha_client.get_settings", return_value=settings):
        return SubodhaClient(transport=transport)


@pytest.fixture
def patched_sleep(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    sleeps: list[float] = []
    mock = AsyncMock(side_effect=lambda s: sleeps.append(s))
    mock.sleeps = sleeps
    monkeypatch.setattr(subodha_client_module.asyncio, "sleep", mock)
    return mock


class TestExtractVideoData:
    def test_returns_none_when_no_metadata_tag(self) -> None:
        assert _extract_video_data("<div>no metadata</div>") is None

    def test_returns_none_on_invalid_json(self, caplog: pytest.LogCaptureFixture) -> None:
        html = '<div data-metadata="not-json"></div>'
        with caplog.at_level(logging.WARNING, logger="app.providers.subodha_client"):
            assert _extract_video_data(html) is None
        assert "Subodha video metadata is malformed" in caplog.text

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

    @pytest.mark.parametrize(
        ("error", "base_delay", "expected_sleep"),
        [
            (httpx.HTTPStatusError(
                "429", request=httpx.Request("GET", "http://x"),
                response=_response(status_code=429, headers={"retry-after": "2"}),
            ), 5.0, 2),
            (httpx.HTTPStatusError(
                "503", request=httpx.Request("GET", "http://x"), response=_response(status_code=503),
            ), 5.0, 5.0),
            (httpx.ConnectError("boom"), 1.0, 1.0),
        ],
    )
    async def test_retries_then_succeeds(
        self,
        patched_sleep: AsyncMock,
        caplog: pytest.LogCaptureFixture,
        error: Exception,
        base_delay: float,
        expected_sleep: float,
    ) -> None:
        fn = AsyncMock(side_effect=[error, "ok"])

        with caplog.at_level(logging.WARNING, logger="app.providers.subodha_client"):
            result = await _with_retry(fn, label="courses", retries=3, base_delay=base_delay)

        assert result == "ok"
        assert patched_sleep.sleeps == [expected_sleep]
        assert "retry" in caplog.text
        assert "waiting" in caplog.text

    async def test_non_retryable_status_raises_immediately(self) -> None:
        resp = _response(status_code=500)
        err = httpx.HTTPStatusError("500", request=httpx.Request("GET", "http://x"), response=resp)
        fn = AsyncMock(side_effect=err)

        with pytest.raises(httpx.HTTPStatusError):
            await _with_retry(fn, label="courses")
        fn.assert_awaited_once()

    async def test_exhausts_retries_and_raises_runtime_error(self, patched_sleep: AsyncMock) -> None:
        fn = AsyncMock(side_effect=httpx.ConnectError("boom"))

        with pytest.raises(RuntimeError, match="failed after 2 retries"):
            await _with_retry(fn, label="courses", retries=2, base_delay=0.1)
        assert fn.await_count == 2


class TestSubodhaClientInit:
    def test_base_url_from_settings(self) -> None:
        client = _make_client(_make_settings(subodha_base_url="https://custom.example.com"))
        assert client._base_url == "https://custom.example.com"

    async def test_aclose_closes_http_client(self) -> None:
        client = _make_client()
        await client.aclose()
        assert client._http.is_closed

    async def test_clear_session_cache_resets_state(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "GET":
                return _response(status_code=200)
            return _response(
                status_code=200,
                json_data={"success": True},
                headers={"content-type": "application/json"},
                cookies={"sessionid": "abc"},
            )

        client = _make_client(transport=_transport(handler))
        await client.get_session()

        client.clear_session_cache()

        assert client._session_cookie is None
        assert client._session_expires_at is None
        assert len(client._http.cookies) == 0


class TestGetSession:
    async def test_reuses_cached_session_when_not_near_expiry(self) -> None:
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if request.method == "GET":
                return _response(status_code=200, cookies={"csrftoken": "tok123"})
            return _response(
                status_code=200,
                json_data={"success": True},
                headers={"content-type": "application/json"},
                cookies={"sessionid": "sess456"},
            )

        client = _make_client(transport=_transport(handler))

        first = await client.get_session()
        second = await client.get_session()

        assert first == second
        assert call_count == 2

    async def test_logs_in_when_no_cached_session(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "GET":
                assert request.url.path == "/"
                return _response(status_code=200, cookies={"csrftoken": "tok123"})
            assert request.url.path == "/api/user/v1/account/login_session/"
            assert request.headers["x-csrftoken"] == "tok123"
            assert request.content == b"email=user1&password=pass1"
            return _response(
                status_code=200,
                json_data={"success": True},
                headers={"content-type": "application/json"},
                cookies={"sessionid": "sess456"},
            )

        client = _make_client(transport=_transport(handler))

        before = datetime.now(UTC)
        result = await client.get_session()
        after = datetime.now(UTC)

        assert "csrftoken=tok123" in result
        assert "sessionid=sess456" in result
        assert before + timedelta(days=7) <= client._session_expires_at <= after + timedelta(days=7)

    async def test_logs_in_when_cached_session_near_expiry(self, monkeypatch: pytest.MonkeyPatch) -> None:
        login_calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal login_calls
            if request.method == "GET":
                return _response(status_code=200)
            login_calls += 1
            return _response(
                status_code=200,
                json_data={"success": True},
                headers={"content-type": "application/json"},
                cookies={"sessionid": f"session-{login_calls}"},
            )

        client = _make_client(transport=_transport(handler))

        near_expiry_login_time = datetime.now(UTC) - timedelta(days=7) + timedelta(minutes=5)
        monkeypatch.setattr(subodha_client_module, "datetime", _frozen_datetime(near_expiry_login_time))
        await client.get_session()
        monkeypatch.setattr(subodha_client_module, "datetime", datetime)

        result = await client.get_session()

        assert "sessionid=session-2" in result
        assert login_calls == 2


class TestLoginFailures:
    async def test_login_failure_raises_runtime_error(self, caplog: pytest.LogCaptureFixture) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "GET":
                return _response(status_code=200)
            return _response(
                status_code=401,
                json_data={"success": False, "error": "bad creds"},
                headers={"content-type": "application/json"},
            )

        client = _make_client(transport=_transport(handler))

        with caplog.at_level(logging.ERROR, logger="app.providers.subodha_client"):
            with pytest.raises(RuntimeError, match="Subodha login failed"):
                await client.get_session()
        assert "login failed" in caplog.text

    async def test_login_non_json_response_treated_as_failure(self, caplog: pytest.LogCaptureFixture) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "GET":
                return _response(status_code=200)
            return _response(status_code=200, headers={"content-type": "text/html"})

        client = _make_client(transport=_transport(handler))

        with caplog.at_level(logging.ERROR, logger="app.providers.subodha_client"):
            with pytest.raises(RuntimeError, match="Subodha login failed"):
                await client.get_session()
        assert "login failed" in caplog.text


class TestListAllCourses:
    @pytest.mark.parametrize(
        ("pages", "expected_ids", "expected_urls"),
        [
            (
                [
                    {"results": [{"id": "c1"}], "pagination": {"next": "https://lms.example.com/api/courses/v1/courses/?page=2&page_size=50"}},
                    {"results": [{"id": "c2"}], "pagination": {}},
                ],
                ["c1", "c2"],
                [
                    "https://lms.example.com/api/courses/v1/courses/?page=1&page_size=50",
                    "https://lms.example.com/api/courses/v1/courses/?page=2&page_size=50",
                ],
            ),
            (
                [{"results": [{"id": "only"}], "pagination": {}}],
                ["only"],
                ["https://lms.example.com/api/courses/v1/courses/?page=1&page_size=50"],
            ),
        ],
    )
    async def test_paginates_until_no_next_url(
        self, patched_sleep: AsyncMock, pages: list[dict], expected_ids: list[str], expected_urls: list[str]
    ) -> None:
        requested_urls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requested_urls.append(str(request.url))
            return _response(status_code=200, json_data=pages[len(requested_urls) - 1])

        client = _make_client(transport=_transport(handler))

        courses = await client.list_all_courses()

        assert [c["id"] for c in courses] == expected_ids
        assert requested_urls == expected_urls


class TestFetchBlocks:
    async def test_fetch_blocks_returns_parsed_data(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/api/courses/v2/blocks/"
            assert request.url.params["course_id"] == "course-1"
            assert request.headers["cookie"] == "session=abc"
            return _response(status_code=200, json_data={"blocks": {"b1": {}}})

        client = _make_client(transport=_transport(handler))

        result = await client.fetch_blocks("course-1", "session=abc")

        assert result == {"blocks": {"b1": {}}}


class TestEnrichBlocksWithContent:
    async def test_enriches_video_block(self) -> None:
        meta = {"sources": ["v.mp4"]}
        video_html = f'<div data-metadata=\'{json.dumps(meta)}\'></div>'

        def handler(request: httpx.Request) -> httpx.Response:
            assert str(request.url) == "https://x/b1"
            return _response(status_code=200, text=video_html)

        client = _make_client(transport=_transport(handler))

        blocks_response = {
            "blocks": {
                "b1": {"id": "b1", "type": "video", "student_view_url": "https://x/b1"},
            }
        }

        result = await client.enrich_blocks_with_content(blocks_response, "session=abc")

        block = result["blocks"]["b1"]
        assert block["student_view_html"] == ""
        assert block["student_view_data"]["sources"] == ["v.mp4"]

    async def test_enriches_html_block(self) -> None:
        # Staff-debug stripping itself is covered in test_subodha_client_html_cleanup.py;
        # this just exercises the html-type dispatch wiring in enrich_blocks_with_content.
        raw = '<div class="xblock"><p>Lesson</p></div>'

        def handler(request: httpx.Request) -> httpx.Response:
            return _response(status_code=200, text=raw)

        client = _make_client(transport=_transport(handler))

        blocks_response = {
            "blocks": {
                "b1": {"id": "b1", "type": "html", "student_view_url": "https://x/b1"},
            }
        }

        result = await client.enrich_blocks_with_content(blocks_response, "session=abc")

        block = result["blocks"]["b1"]
        assert block["student_view_html"] == "<p>Lesson</p>"
        assert block["student_view_data"] is None

    @pytest.mark.parametrize(
        "block",
        [
            {"id": "b1", "type": "html"},
            {"id": "b1", "type": "other", "student_view_url": "https://x/b1"},
        ],
    )
    async def test_skips_block_when_not_enrichable(self, block: dict) -> None:
        client = _make_client(transport=_transport(_unexpected_request))

        blocks_response = {"blocks": {"b1": dict(block)}}

        result = await client.enrich_blocks_with_content(blocks_response, "session=abc")

        assert result["blocks"]["b1"] == block

    async def test_partial_failure_still_reports_all_failures(self) -> None:
        ok_html = '<div class="xblock"><p>ok</p></div>'

        def handler(request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            if "b1" in url:
                return _response(status_code=200, text=ok_html)
            if "b2" in url:
                raise RuntimeError("boom-b2")
            raise RuntimeError("boom-b3")

        client = _make_client(transport=_transport(handler))

        blocks_response = {
            "blocks": {
                "b1": {"id": "b1", "type": "html", "student_view_url": "https://x/b1"},
                "b2": {"id": "b2", "type": "html", "student_view_url": "https://x/b2"},
                "b3": {"id": "b3", "type": "html", "student_view_url": "https://x/b3"},
            }
        }

        with pytest.raises(RuntimeError, match="2/3 xblocks failed") as exc_info:
            await client.enrich_blocks_with_content(blocks_response, "session=abc")

        message = str(exc_info.value)
        assert "b2: boom-b2" in message
        assert "b3: boom-b3" in message
        assert blocks_response["blocks"]["b1"]["student_view_html"] == "<p>ok</p>"


class TestFetchAsset:
    async def test_fetch_asset_returns_bytes(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert str(request.url) == "https://lms.example.com/assets/file.png"
            assert request.headers["cookie"] == "session=abc"
            return _response(status_code=200, content=b"binary-data")

        client = _make_client(transport=_transport(handler))

        result = await client.fetch_asset("/assets/file.png", "session=abc")

        assert result == b"binary-data"

    async def test_fetch_asset_raises_on_http_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return _response(status_code=404, content=b"")

        client = _make_client(transport=_transport(handler))

        with pytest.raises(httpx.HTTPStatusError):
            await client.fetch_asset("/missing.png", "session=abc")


class TestSingleton:
    @pytest.fixture(autouse=True)
    def _reset_singleton(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(subodha_client_module, "_client", None)

    def test_get_subodha_client_returns_singleton(self) -> None:
        with patch("app.providers.subodha_client.get_settings", return_value=_make_settings()):
            c1 = get_subodha_client()
            c2 = get_subodha_client()
        assert c1 is c2

    async def test_close_subodha_client_closes_and_resets(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with patch("app.providers.subodha_client.get_settings", return_value=_make_settings()):
            client = get_subodha_client()
        mock_aclose = AsyncMock()
        monkeypatch.setattr(client, "aclose", mock_aclose)

        await close_subodha_client()

        mock_aclose.assert_awaited_once()
        assert subodha_client_module._client is None

    async def test_close_subodha_client_is_noop_when_never_created(self) -> None:
        await close_subodha_client()  # should not raise
        assert subodha_client_module._client is None
