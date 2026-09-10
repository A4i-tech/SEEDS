"""Subodha LMS client — session auth, paging, xblock enrichment, and retry policy."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest

from app.providers import subodha_client as module
from app.providers.subodha_client import SubodhaClient, close_subodha_client, get_subodha_client

BASE_URL = "https://lms.test"
COOKIE = "sessionid=abc"
_real_sleep = asyncio.sleep


async def _no_backoff(*_args) -> None:
    await _real_sleep(0)


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    values = SimpleNamespace(
        subodha_base_url=BASE_URL,
        subodha_username="lms@a4i.org",
        subodha_password="pw",
        subodha_page_size=2,
        subodha_page_delay_ms=0,
        subodha_xblock_concurrency=2,
        subodha_xblock_delay_ms=0,
    )
    monkeypatch.setattr(module, "get_settings", lambda: values)
    monkeypatch.setattr(module.asyncio, "sleep", _no_backoff)
    return values


@pytest.fixture
def routed(monkeypatch):
    """Build a client whose HTTP calls are served by a handler the test provides."""

    def _build(handler):
        client = SubodhaClient()
        client._http = httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=1.0)
        return client

    return _build


def _xblock_page(body: str) -> str:
    return (
        "<html><body>"
        '<script class="xblock-json-init-args">{"noise": 1}</script>'
        f'<div class="xblock">{body}</div>'
        '<div class="staff-modal">staff only</div>'
        "</body></html>"
    )


class TestGetSession:
    @pytest.mark.asyncio
    async def test_a_successful_login_builds_a_cookie_from_both_responses(self, routed) -> None:
        def handler(request):
            if request.url.path == "/":
                return httpx.Response(200, headers={"set-cookie": "csrftoken=tok; Path=/"})
            assert request.headers["X-CSRFToken"] == "tok"
            assert request.headers["Referer"] == f"{BASE_URL}/login"
            return httpx.Response(
                200, json={"success": True}, headers={"set-cookie": "sessionid=abc; Path=/"}
            )

        client = routed(handler)
        cookie = await client.get_session()

        assert "csrftoken=tok" in cookie
        assert "sessionid=abc" in cookie

    @pytest.mark.asyncio
    async def test_the_credentials_are_posted_as_a_form(self, routed, settings) -> None:
        posted = {}

        def handler(request):
            if request.url.path == "/":
                return httpx.Response(200)
            posted["body"] = request.content.decode()
            return httpx.Response(200, json={"success": True})

        await routed(handler).get_session()

        assert "email=lms%40a4i.org" in posted["body"]
        assert "password=pw" in posted["body"]

    @pytest.mark.asyncio
    async def test_a_rejected_login_raises(self, routed) -> None:
        def handler(request):
            if request.url.path == "/":
                return httpx.Response(200)
            return httpx.Response(200, json={"success": False, "value": "bad credentials"})

        with pytest.raises(RuntimeError, match="Subodha login failed"):
            await routed(handler).get_session()

    @pytest.mark.asyncio
    async def test_a_non_json_login_response_is_treated_as_a_failure(self, routed) -> None:
        def handler(request):
            if request.url.path == "/":
                return httpx.Response(200)
            return httpx.Response(200, text="<html>maintenance</html>")

        with pytest.raises(RuntimeError, match="Subodha login failed"):
            await routed(handler).get_session()

    @pytest.mark.asyncio
    async def test_a_live_session_is_reused_without_logging_in_again(self, routed) -> None:
        calls = []

        def handler(request):
            calls.append(request.url.path)
            return httpx.Response(
                200, json={"success": True}, headers={"set-cookie": "sessionid=abc; Path=/"}
            )

        client = routed(handler)
        first = await client.get_session()
        calls.clear()

        assert await client.get_session() == first
        assert calls == []

    @pytest.mark.asyncio
    async def test_a_session_inside_the_renewal_window_is_replaced(self, routed) -> None:
        """The cache is given up 30 minutes early so a call never runs on a dying session."""
        calls = []

        def handler(request):
            calls.append(request.url.path)
            return httpx.Response(
                200, json={"success": True}, headers={"set-cookie": "sessionid=fresh; Path=/"}
            )

        client = routed(handler)
        await client.get_session()
        client._session_expires_at = datetime.now(UTC) + timedelta(minutes=29)
        stale_expiry = client._session_expires_at
        calls.clear()

        assert "sessionid=fresh" in await client.get_session()
        assert calls == ["/", "/api/user/v1/account/login_session/"]
        assert client._session_expires_at > stale_expiry, "a re-login that keeps the old expiry re-logs in on every call"

    @pytest.mark.asyncio
    async def test_an_expired_session_is_replaced(self, routed) -> None:
        calls = []

        def handler(request):
            calls.append(request.url.path)
            return httpx.Response(
                200, json={"success": True}, headers={"set-cookie": "sessionid=fresh; Path=/"}
            )

        client = routed(handler)
        await client.get_session()
        client._session_expires_at = datetime.now(UTC) - timedelta(days=1)
        calls.clear()

        await client.get_session()
        assert calls == ["/", "/api/user/v1/account/login_session/"]

    @pytest.mark.asyncio
    async def test_clearing_the_cache_forces_a_fresh_login(self, routed) -> None:
        calls = []

        def handler(request):
            calls.append(request.url.path)
            return httpx.Response(
                200, json={"success": True}, headers={"set-cookie": "sessionid=abc; Path=/"}
            )

        client = routed(handler)
        await client.get_session()
        client.clear_session_cache()
        calls.clear()

        await client.get_session()
        assert calls == ["/", "/api/user/v1/account/login_session/"]


class TestListAllCourses:
    @pytest.mark.asyncio
    async def test_every_page_is_followed_and_the_results_concatenated(self, routed) -> None:
        pages = {
            "1": {"results": [{"id": "c1"}, {"id": "c2"}],
                  "pagination": {"next": f"{BASE_URL}/api/courses/v1/courses/?page=2"}},
            "2": {"results": [{"id": "c3"}], "pagination": {"next": None}},
        }

        def handler(request):
            return httpx.Response(200, json=pages[request.url.params.get("page", "1")])

        courses = await routed(handler).list_all_courses()
        assert [c["id"] for c in courses] == ["c1", "c2", "c3"]

    @pytest.mark.asyncio
    async def test_the_first_request_carries_the_configured_page_size(self, routed) -> None:
        seen = {}

        def handler(request):
            seen["page_size"] = request.url.params.get("page_size")
            return httpx.Response(200, json={"results": [], "pagination": {}})

        await routed(handler).list_all_courses()
        assert seen["page_size"] == "2"

    @pytest.mark.asyncio
    async def test_a_response_without_pagination_ends_the_walk(self, routed) -> None:
        def handler(request):
            return httpx.Response(200, json={"results": [{"id": "c1"}]})

        assert len(await routed(handler).list_all_courses()) == 1


class TestFetchBlocks:
    @pytest.mark.asyncio
    async def test_the_course_tree_is_requested_in_full_with_the_session_cookie(
        self, routed
    ) -> None:
        seen = {}

        def handler(request):
            seen["params"] = dict(request.url.params)
            seen["cookie"] = request.headers["Cookie"]
            return httpx.Response(200, json={"blocks": {}})

        await routed(handler).fetch_blocks("course-v1:A4I+S1+2026", COOKIE)

        assert seen["cookie"] == COOKIE
        assert seen["params"]["course_id"] == "course-v1:A4I+S1+2026"
        assert (seen["params"]["depth"], seen["params"]["all_blocks"]) == ("all", "true")

    @pytest.mark.asyncio
    async def test_a_404_is_not_retried_and_surfaces(self, routed) -> None:
        calls = []

        def handler(request):
            calls.append(request.url.path)
            return httpx.Response(404)

        with pytest.raises(httpx.HTTPStatusError):
            await routed(handler).fetch_blocks("course-1", COOKIE)
        assert len(calls) == 1


class TestEnrichBlocks:
    @pytest.mark.asyncio
    async def test_html_blocks_get_their_xblock_body_stripped_of_staff_panels(
        self, routed
    ) -> None:
        def handler(request):
            return httpx.Response(200, text=_xblock_page("<p>Lesson one</p>"))

        blocks = {"blocks": {"b1": {
            "id": "b1", "type": "html", "student_view_url": f"{BASE_URL}/xblock/b1"
        }}}

        result = await routed(handler).enrich_blocks_with_content(blocks, COOKIE)

        block = result["blocks"]["b1"]
        assert block["student_view_html"] == "<p>Lesson one</p>"
        assert "staff only" not in block["student_view_html"]
        assert block["student_view_data"] is None

    @pytest.mark.asyncio
    async def test_mathtype_annotations_are_removed(self, routed) -> None:
        def handler(request):
            return httpx.Response(
                200, text=_xblock_page("<p>a MathType@MTEF@junk@1A2b@ b</p>")
            )

        blocks = {"blocks": {"b1": {
            "id": "b1", "type": "html", "student_view_url": f"{BASE_URL}/xblock/b1"
        }}}

        result = await routed(handler).enrich_blocks_with_content(blocks, COOKIE)
        assert result["blocks"]["b1"]["student_view_html"] == "<p>a  b</p>"

    @pytest.mark.asyncio
    async def test_video_blocks_get_their_metadata_instead_of_html(self, routed) -> None:
        metadata = {
            "sources": ["https://cdn/v.mp4"],
            "streams": "1.00:abc",
            "poster": "https://cdn/p.jpg",
            "transcriptLanguages": {"en": "English"},
        }

        attribute = json.dumps(metadata).replace('"', "&quot;")

        def handler(request):
            return httpx.Response(200, text=f'<div data-metadata="{attribute}"></div>')

        blocks = {"blocks": {"v1": {
            "id": "v1", "type": "video", "student_view_url": f"{BASE_URL}/xblock/v1"
        }}}

        result = await routed(handler).enrich_blocks_with_content(blocks, COOKIE)

        block = result["blocks"]["v1"]
        assert block["student_view_data"] == metadata
        assert block["student_view_html"] == ""

    @pytest.mark.asyncio
    async def test_a_video_without_metadata_is_recorded_as_none(self, routed) -> None:
        def handler(request):
            return httpx.Response(200, text="<div>no metadata here</div>")

        blocks = {"blocks": {"v1": {
            "id": "v1", "type": "video", "student_view_url": f"{BASE_URL}/xblock/v1"
        }}}

        result = await routed(handler).enrich_blocks_with_content(blocks, COOKIE)
        assert result["blocks"]["v1"]["student_view_data"] is None

    @pytest.mark.asyncio
    async def test_blocks_that_are_not_content_are_left_untouched(self, routed) -> None:
        def handler(request):
            raise AssertionError("no xblock should be fetched")

        blocks = {"blocks": {
            "chapter": {"id": "chapter", "type": "chapter",
                        "student_view_url": f"{BASE_URL}/xblock/chapter"},
            "no_url": {"id": "no_url", "type": "html"},
        }}

        assert await routed(handler).enrich_blocks_with_content(blocks, COOKIE) == blocks

    @pytest.mark.asyncio
    async def test_a_failing_xblock_is_reported_loudly_not_skipped(self, routed) -> None:
        def handler(request):
            return httpx.Response(500)

        blocks = {"blocks": {"b1": {
            "id": "b1", "type": "html", "student_view_url": f"{BASE_URL}/xblock/b1"
        }}}

        with pytest.raises(RuntimeError, match="1/1 xblocks failed to enrich"):
            await routed(handler).enrich_blocks_with_content(blocks, COOKIE)


class TestFetchAsset:
    @pytest.mark.asyncio
    async def test_a_relative_url_is_resolved_against_the_lms_base(self, routed) -> None:
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            return httpx.Response(200, content=b"\x89PNG")

        assert await routed(handler).fetch_asset("/asset-v1:img.png", COOKIE) == b"\x89PNG"
        assert seen["url"] == f"{BASE_URL}/asset-v1:img.png"

    @pytest.mark.asyncio
    async def test_a_missing_asset_raises(self, routed) -> None:
        def handler(request):
            return httpx.Response(404)

        with pytest.raises(httpx.HTTPStatusError):
            await routed(handler).fetch_asset("/asset-v1:gone.png", COOKIE)


class TestRetryPolicy:
    @pytest.mark.asyncio
    async def test_a_429_is_retried_until_it_succeeds(self) -> None:
        attempts = []

        async def flaky():
            attempts.append(1)
            if len(attempts) < 3:
                raise httpx.HTTPStatusError(
                    "rate limited", request=httpx.Request("GET", BASE_URL),
                    response=httpx.Response(429),
                )
            return "ok"

        assert await module._with_retry(flaky, label="t", base_delay=0) == "ok"
        assert len(attempts) == 3

    @pytest.mark.asyncio
    async def test_a_503_is_retried_too(self) -> None:
        attempts = []

        async def flaky():
            attempts.append(1)
            if len(attempts) < 2:
                raise httpx.HTTPStatusError(
                    "unavailable", request=httpx.Request("GET", BASE_URL),
                    response=httpx.Response(503, headers={"retry-after": "1"}),
                )
            return "ok"

        assert await module._with_retry(flaky, label="t", base_delay=0) == "ok"

    @pytest.mark.asyncio
    async def test_a_network_error_is_retried(self) -> None:
        attempts = []

        async def flaky():
            attempts.append(1)
            if len(attempts) < 2:
                raise httpx.ConnectError("dns failure")
            return "ok"

        assert await module._with_retry(flaky, label="t", base_delay=0) == "ok"

    @pytest.mark.asyncio
    async def test_a_non_retryable_status_is_raised_straight_away(self) -> None:
        attempts = []

        async def failing():
            attempts.append(1)
            raise httpx.HTTPStatusError(
                "forbidden", request=httpx.Request("GET", BASE_URL),
                response=httpx.Response(403),
            )

        with pytest.raises(httpx.HTTPStatusError):
            await module._with_retry(failing, label="t", base_delay=0)
        assert len(attempts) == 1

    @pytest.mark.asyncio
    async def test_exhausting_the_retries_fails_with_the_label(self) -> None:
        async def always_429():
            raise httpx.HTTPStatusError(
                "rate limited", request=httpx.Request("GET", BASE_URL),
                response=httpx.Response(429),
            )

        with pytest.raises(RuntimeError, match="blocks c1 failed after 2 retries"):
            await module._with_retry(always_429, label="blocks c1", retries=2, base_delay=0)


class TestSingleton:
    @pytest.mark.asyncio
    async def test_the_client_is_reused_and_closed_once(self, monkeypatch) -> None:
        monkeypatch.setattr(module, "_client", None)

        client = get_subodha_client()
        assert get_subodha_client() is client

        await close_subodha_client()
        assert module._client is None

    @pytest.mark.asyncio
    async def test_closing_without_a_client_is_a_no_op(self, monkeypatch) -> None:
        monkeypatch.setattr(module, "_client", None)
        await close_subodha_client()
