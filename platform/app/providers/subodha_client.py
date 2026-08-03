"""
Subodha (Open edX) LMS client — session auth, course listing, block fetch.

Ported from subodha/backend/src/{auth,listCourses,fetchBlocks,fetchXBlockContent}.ts.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

_CONTENT_TYPES_FOR_XBLOCK = {"html", "video", "problem", "drag-and-drop-v2"}
_XBLOCK_JSON_INIT_RE = re.compile(r"<script[^>]+xblock-json-init-args[^>]*>.*?</script>", re.I | re.S)
_XBLOCK_DIV_OPEN_RE = re.compile(r'<div[^>]+class="[^"]*\bxblock\b[^"]*"[^>]*>', re.I)
_DIV_TAG_RE = re.compile(r"<div\b|</div>", re.I)
_VIDEO_METADATA_RE = re.compile(r"data-metadata='([^']+)'")


def _extract_html(raw: str) -> str:
    """Extract the xblock's own content out of the full page the LMS returns.

    The xblock endpoint responds with an entire HTML document, not a fragment,
    and this instance's markup always has trailing siblings (staff-debug modals,
    footer scripts, </body></html>) after the xblock div — so anchoring on the
    *last* </div> in the document (as a naive regex would) never matches and
    silently falls back to the whole 30KB+ page. Track div nesting depth from
    the opening tag instead, to find the div's actual matching close.
    """
    stripped = _XBLOCK_JSON_INIT_RE.sub("", raw)
    open_match = _XBLOCK_DIV_OPEN_RE.search(stripped)
    if not open_match:
        return stripped.strip()

    depth = 1
    content_start = open_match.end()
    for tag in _DIV_TAG_RE.finditer(stripped, content_start):
        depth += -1 if tag.group().lower().startswith("</div") else 1
        if depth == 0:
            return stripped[content_start : tag.start()].strip()

    return stripped[content_start:].strip()


def _extract_video_data(raw: str) -> dict[str, Any] | None:
    import json

    m = _VIDEO_METADATA_RE.search(raw)
    if not m:
        return None
    decoded = (
        m.group(1)
        .replace("&#34;", '"')
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&amp;", "&")
    )
    try:
        meta = json.loads(decoded)
    except (ValueError, TypeError):
        return None
    return {
        "sources": meta.get("sources") or [],
        "streams": meta.get("streams") or "",
        "poster": meta.get("poster"),
        "transcriptLanguages": meta.get("transcriptLanguages") or {},
    }


async def _with_retry(fn, *, label: str = "", retries: int = 5, base_delay: float = 5.0):
    """Retry *fn* on 429/503/network errors with exponential backoff."""
    for attempt in range(1, retries + 1):
        try:
            return await fn()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status not in (429, 503):
                raise
            retry_after = int(exc.response.headers.get("retry-after", "0") or "0")
            wait = retry_after if retry_after > 0 else base_delay * attempt
            logger.warning("[retry] %s %d — waiting %.1fs (attempt %d/%d)", label, status, wait, attempt, retries)
            await asyncio.sleep(wait)
        except httpx.TransportError as exc:
            wait = base_delay * attempt
            logger.warning("[retry] %s %s — waiting %.1fs (attempt %d/%d)", label, exc, wait, attempt, retries)
            await asyncio.sleep(wait)
    raise RuntimeError(f"{label} failed after {retries} retries")


class SubodhaClient:
    """Stateful client: owns the HTTP connection pool and LMS session cookie."""

    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self._base_url = settings.subodha_base_url
        self._http = httpx.AsyncClient(timeout=30.0)
        self._session_cookie: str | None = None
        self._session_expires_at: datetime | None = None

    async def aclose(self) -> None:
        await self._http.aclose()

    def clear_session_cache(self) -> None:
        self._session_cookie = None
        self._session_expires_at = None

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    async def get_session(self) -> str:
        now = datetime.now(UTC)
        if self._session_cookie and self._session_expires_at and now < self._session_expires_at - timedelta(minutes=30):
            return self._session_cookie

        init_res = await self._http.get(f"{self._base_url}/")
        jar = {c.name: c.value for c in init_res.cookies.jar}

        login_res = await self._http.post(
            f"{self._base_url}/api/user/v1/account/login_session/",
            data={"email": self._settings.subodha_username, "password": self._settings.subodha_password},
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-CSRFToken": jar.get("csrftoken", ""),
                "Referer": f"{self._base_url}/login",
                "Cookie": "; ".join(f"{k}={v}" for k, v in jar.items()),
            },
        )
        body = login_res.json() if login_res.headers.get("content-type", "").startswith("application/json") else {}
        if not body.get("success"):
            raise RuntimeError(f"Subodha login failed: {body}")

        jar.update({c.name: c.value for c in login_res.cookies.jar})
        self._session_cookie = "; ".join(f"{k}={v}" for k, v in jar.items())
        self._session_expires_at = now + timedelta(days=7)
        return self._session_cookie

    # ------------------------------------------------------------------
    # Courses
    # ------------------------------------------------------------------

    async def list_all_courses(self) -> list[dict[str, Any]]:
        courses: list[dict[str, Any]] = []
        page_size = self._settings.subodha_page_size
        url: str | None = f"{self._base_url}/api/courses/v1/courses/?page=1&page_size={page_size}"
        page = 1

        while url:
            current_url = url
            res = await _with_retry(lambda u=current_url: self._http.get(u), label=f"courses page {page}")
            res.raise_for_status()
            data = res.json()
            courses.extend(data.get("results", []))
            url = (data.get("pagination") or {}).get("next")
            page += 1
            if url:
                await asyncio.sleep(self._settings.subodha_page_delay_ms / 1000)

        return courses

    async def fetch_blocks(self, course_id: str, session_cookie: str) -> dict[str, Any]:
        params = {
            "course_id": course_id,
            "depth": "all",
            "all_blocks": "true",
            "requested_fields": "display_name,type,student_view_data,student_view_html,children",
        }
        res = await _with_retry(
            lambda: self._http.get(
                f"{self._base_url}/api/courses/v2/blocks/",
                params=params,
                headers={"Cookie": session_cookie},
            ),
            label=f"blocks {course_id}",
        )
        res.raise_for_status()
        return res.json()

    async def enrich_blocks_with_content(self, blocks_response: dict[str, Any], session_cookie: str) -> dict[str, Any]:
        blocks: dict[str, dict[str, Any]] = blocks_response.get("blocks") or {}
        entries = [b for b in blocks.values() if b.get("type") in _CONTENT_TYPES_FOR_XBLOCK and b.get("student_view_url")]

        semaphore = asyncio.Semaphore(self._settings.subodha_xblock_concurrency)

        async def enrich_one(block: dict[str, Any]) -> None:
            async with semaphore:
                try:
                    res = await _with_retry(
                        lambda: self._http.get(block["student_view_url"], headers={"Cookie": session_cookie}),
                        label=f"xblock {block.get('id')}",
                    )
                    res.raise_for_status()
                    raw = res.text
                    if block.get("type") == "video":
                        block["student_view_data"] = _extract_video_data(raw)
                        block["student_view_html"] = ""
                    else:
                        block["student_view_html"] = _extract_html(raw)
                        block["student_view_data"] = None
                except Exception:  # noqa: BLE001
                    block["student_view_html"] = ""
                    block["student_view_data"] = None
                await asyncio.sleep(self._settings.subodha_xblock_delay_ms / 1000)

        await asyncio.gather(*(enrich_one(b) for b in entries))
        return blocks_response

    # ------------------------------------------------------------------
    # Assets
    # ------------------------------------------------------------------

    async def fetch_asset(self, relative_url: str, session_cookie: str) -> bytes:
        res = await self._http.get(f"{self._base_url}{relative_url}", headers={"Cookie": session_cookie})
        res.raise_for_status()
        return res.content


_client: SubodhaClient | None = None


def get_subodha_client() -> SubodhaClient:
    """Return the process-wide SubodhaClient singleton (reuses the HTTP connection pool)."""
    global _client  # noqa: PLW0603
    if _client is None:
        _client = SubodhaClient()
    return _client
