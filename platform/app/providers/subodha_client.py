"""
Subodha (Open edX) LMS client — session auth, course listing, block fetch.

Ported from subodha/backend/src/{auth,listCourses,fetchBlocks,fetchXBlockContent}.ts.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any, NotRequired, TypedDict

import httpx
from bs4 import BeautifulSoup

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

_CONTENT_TYPES_FOR_XBLOCK = {"html", "video", "problem", "drag-and-drop-v2"}
_STAFF_DEBUG_SELECTOR = ".wrap-instructor-info, .xqa-modal, .staff-modal, .history-modal"
_MATHTYPE_ANNOTATION_RE = re.compile(r"MathType@MTEF@.*?@[0-9A-Fa-f]{4}@", re.S)


class SubodhaCourse(TypedDict):
    id: str
    name: str
    org: str
    number: str
    start: str
    pacing: str
    hidden: bool
    invitation_only: bool
    mobile_available: bool
    short_description: NotRequired[str]
    language: NotRequired[str]


def _strip_staff_debug(html: str) -> str:
    """Remove staff-only debug/QA panels the LMS nests inside the xblock's own
    content div (not as trailing page siblings, but as siblings within the div
    `_extract_html` already isolates) — these are never part of the lesson."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.select(_STAFF_DEBUG_SELECTOR):
        tag.decompose()
    return str(soup)


def _extract_html(raw: str) -> str:
    """Extract the xblock's own content out of the full page the LMS returns.

    The xblock endpoint responds with an entire HTML document, not a fragment,
    and this instance's markup always has trailing siblings (staff-debug modals,
    footer scripts, </body></html>) after the xblock div.
    """
    soup = BeautifulSoup(raw, "html.parser")
    for script in soup.find_all("script", class_="xblock-json-init-args"):
        script.decompose()
    xblock_div = soup.find("div", class_=lambda c: c == "xblock")
    return xblock_div.decode_contents().strip()


def _extract_video_data(raw: str) -> dict[str, object] | None:
    soup = BeautifulSoup(raw, "html.parser")
    tag = soup.find(attrs={"data-metadata": True})
    if tag is None:
        return None
    try:
        meta = json.loads(tag["data-metadata"])
    except (ValueError, TypeError):
        return None
    return {
        "sources": meta.get("sources") or [],
        "streams": meta.get("streams"),
        "poster": meta.get("poster"),
        "transcriptLanguages": meta.get("transcriptLanguages") or {},
    }


async def _with_retry(fn, *, label: str = "", retries: int = 5, base_delay: float = 5.0):
    """Retry *fn* on 429/503/network errors with exponential backoff."""
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            return await fn()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status not in (429, 503):
                raise
            last_exc = exc
            retry_after = int(exc.response.headers.get("retry-after", "0") or "0")
            wait = retry_after if retry_after > 0 else base_delay * attempt
            logger.warning("[retry] %s %d — waiting %.1fs (attempt %d/%d)", label, status, wait, attempt, retries)
            await asyncio.sleep(wait)
        except httpx.TransportError as exc:
            last_exc = exc
            wait = base_delay * attempt
            logger.warning("[retry] %s %s — waiting %.1fs (attempt %d/%d)", label, exc, wait, attempt, retries)
            await asyncio.sleep(wait)
    raise RuntimeError(f"{label} failed after {retries} retries") from last_exc


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
            logger.info("[subodha-auth] reusing cached session, expires_at=%s", self._session_expires_at.isoformat())
            return self._session_cookie

        logger.info("[subodha-auth] no valid cached session, starting login flow base_url=%s", self._base_url)

        init_res = await self._http.get(f"{self._base_url}/")
        jar = {c.name: c.value for c in init_res.cookies.jar}
        logger.info(
            "[subodha-auth] GET / status=%d cookies=%s",
            init_res.status_code, sorted(jar.keys()),
        )

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
        logger.info(
            "[subodha-auth] POST login_session/ status=%d content-type=%s set-cookies=%s",
            login_res.status_code, login_res.headers.get("content-type"),
            sorted(c.name for c in login_res.cookies.jar),
        )
        body = login_res.json() if login_res.headers.get("content-type", "").startswith("application/json") else {}
        if not body.get("success"):
            logger.error(
                "[subodha-auth] login failed status=%d body=%s headers=%s",
                login_res.status_code, body, dict(login_res.headers),
            )
            raise RuntimeError(f"Subodha login failed: {body}")

        jar.update({c.name: c.value for c in login_res.cookies.jar})
        self._session_cookie = "; ".join(f"{k}={v}" for k, v in jar.items())
        self._session_expires_at = now + timedelta(days=7)
        logger.info("[subodha-auth] login succeeded, session cached until %s", self._session_expires_at.isoformat())
        return self._session_cookie

    # ------------------------------------------------------------------
    # Courses
    # ------------------------------------------------------------------

    async def list_all_courses(self) -> list[SubodhaCourse]:
        courses: list[SubodhaCourse] = []
        page_size = self._settings.subodha_page_size
        url: str | None = f"{self._base_url}/api/courses/v1/courses/?page=1&page_size={page_size}"
        page = 1

        while url:
            current_url = url

            async def _get(u=current_url):
                res = await self._http.get(u)
                res.raise_for_status()
                return res

            res = await _with_retry(_get, label=f"courses page {page}")
            data = res.json()
            results = data.get("results", [])
            courses.extend(results)
            logger.info("[subodha-courses] page=%d fetched=%d running_total=%d", page, len(results), len(courses))
            url = (data.get("pagination") or {}).get("next")
            page += 1
            if url:
                await asyncio.sleep(self._settings.subodha_page_delay_ms / 1000)

        logger.info("[subodha-courses] list_all_courses done, total=%d", len(courses))
        return courses

    async def fetch_blocks(self, course_id: str, session_cookie: str) -> dict[str, Any]:
        params = {
            "course_id": course_id,
            "depth": "all",
            "all_blocks": "true",
            "requested_fields": "display_name,type,student_view_data,student_view_html,children",
        }
        async def _get():
            res = await self._http.get(
                f"{self._base_url}/api/courses/v2/blocks/",
                params=params,
                headers={"Cookie": session_cookie},
            )
            res.raise_for_status()
            return res

        res = await _with_retry(_get, label=f"blocks {course_id}")
        data = res.json()
        logger.info("[subodha-blocks] course=%s status=%d blocks=%d", course_id, res.status_code, len(data.get("blocks") or {}))
        return data

    async def enrich_blocks_with_content(self, blocks_response: dict[str, Any], session_cookie: str) -> dict[str, Any]:
        blocks: dict[str, dict[str, Any]] = blocks_response.get("blocks") or {}
        entries = [b for b in blocks.values() if b.get("type") in _CONTENT_TYPES_FOR_XBLOCK and b.get("student_view_url")]
        logger.info("[subodha-enrich] xblocks to enrich=%d concurrency=%d", len(entries), self._settings.subodha_xblock_concurrency)

        semaphore = asyncio.Semaphore(self._settings.subodha_xblock_concurrency)
        failures: list[str] = []

        async def enrich_one(block: dict[str, Any]) -> None:
            async with semaphore:
                try:
                    async def _get():
                        res = await self._http.get(block["student_view_url"], headers={"Cookie": session_cookie})
                        res.raise_for_status()
                        return res

                    res = await _with_retry(_get, label=f"xblock {block.get('id')}")
                    raw = res.text
                    if block.get("type") == "video":
                        block["student_view_data"] = _extract_video_data(raw)
                        block["student_view_html"] = ""
                    else:
                        extracted = _strip_staff_debug(_extract_html(raw))
                        block["student_view_html"] = _MATHTYPE_ANNOTATION_RE.sub("", extracted)
                        block["student_view_data"] = None
                except Exception as exc:  # noqa: BLE001
                    failures.append(f"{block.get('id')}: {exc}")
                await asyncio.sleep(self._settings.subodha_xblock_delay_ms / 1000)

        await asyncio.gather(*(enrich_one(b) for b in entries))
        if failures:
            logger.error("[subodha-enrich] %d/%d xblocks failed: %s", len(failures), len(entries), failures)
            raise RuntimeError(f"{len(failures)}/{len(entries)} xblocks failed to enrich: {'; '.join(failures)}")
        logger.info("[subodha-enrich] enriched=%d/%d", len(entries), len(entries))
        return blocks_response

    # ------------------------------------------------------------------
    # Assets
    # ------------------------------------------------------------------

    async def fetch_asset(self, relative_url: str, session_cookie: str) -> bytes:
        res = await self._http.get(f"{self._base_url}{relative_url}", headers={"Cookie": session_cookie})
        res.raise_for_status()
        logger.info("[subodha-asset] fetched url=%s status=%d bytes=%d", relative_url, res.status_code, len(res.content))
        return res.content


_client: SubodhaClient | None = None


def get_subodha_client() -> SubodhaClient:
    """Return the process-wide SubodhaClient singleton (reuses the HTTP connection pool)."""
    global _client  # noqa: PLW0603
    if _client is None:
        _client = SubodhaClient()
    return _client


async def close_subodha_client() -> None:
    """Close the SubodhaClient singleton's HTTP connection pool, if one was ever created."""
    global _client  # noqa: PLW0603
    if _client is not None:
        await _client.aclose()
        _client = None
