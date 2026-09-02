from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup, Comment, NavigableString

from app.platform.error_handling import ValidationError

_ALLOWED_SCHEMES = {"http", "https"}
_MAX_REDIRECTS = 5

# --- SDK-parity text extraction ---------------------------------------------
# The admin "translate a website" flow keys every extracted string with the
# identical hash the runtime SDK computes for the same content in the live DOM
# (sdk_hash_text mirrors sdk.js hashText). For the keys to line up, extraction
# must produce the *same strings* the SDK hashes. The SDK walks the DOM with a
# TreeWalker(SHOW_TEXT) and registers ONE key per text node
# (node.textContent.trim()) — so text inside inline elements (<b>, <a>, ...) is
# its own separate node/key. Collapsing an element into a single string (any
# get_text(...) call) produces a key the SDK never generates for markup like
# "<p>Hello <b>world</b></p>", so the persisted translation is never applied.
# We therefore mirror the SDK node-for-node.

# Tags whose (immediate-parent) text nodes the SDK skips (sdk.js SKIP_TAGS).
_SKIP_PARENT_TAGS = {"script", "style", "noscript", "title"}

# sdk.js isTranslatable(): reject empty / whitespace / purely
# numeric-and-punctuation text. Same character class as the SDK regex.
_NON_TRANSLATABLE_RE = re.compile(r"^[\d\s.,%$₹-]+$")


def _sdk_is_translatable(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return False
    return _NON_TRANSLATABLE_RE.match(trimmed) is None


def _sdk_text_nodes(root) -> list[str]:
    """Trimmed text of every translatable text node under *root*, in document
    order — one entry per text node, exactly as the SDK's registerNode() sees
    them. Skips text whose immediate parent is a SKIP tag and any node under a
    [data-no-translate] subtree (mirroring sdk.js isSkippableElement)."""
    out: list[str] = []
    for node in root.descendants:
        if not isinstance(node, NavigableString) or isinstance(node, Comment):
            continue
        parent = node.parent
        if parent is not None and parent.name and parent.name.lower() in _SKIP_PARENT_TAGS:
            continue
        if any(
            hasattr(ancestor, "has_attr") and ancestor.has_attr("data-no-translate")
            for ancestor in node.parents
        ):
            continue
        if _sdk_is_translatable(str(node)):
            out.append(str(node).strip())
    return out


def _is_blocked_ip(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


async def _validate_url(url: str) -> None:
    """Reject non-http(s) schemes and any host resolving to a non-public IP.

    Blocks localhost/loopback, RFC1918 private ranges, link-local (which
    covers the 169.254.169.254 cloud metadata endpoint), multicast, and
    other reserved ranges. Must be called before the initial request and
    again before following each redirect hop.
    """
    parts = urlsplit(url)

    if parts.scheme not in _ALLOWED_SCHEMES:
        raise ValidationError(f"URL scheme must be http or https, got: {parts.scheme!r}")

    hostname = parts.hostname
    if not hostname:
        raise ValidationError("URL must include a hostname")

    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, hostname, None)
    except socket.gaierror as exc:
        raise ValidationError(f"Could not resolve host: {hostname}") from exc

    for info in infos:
        ip = info[4][0]
        if _is_blocked_ip(ip):
            raise ValidationError(f"URL resolves to a disallowed address: {hostname}")


class WebsiteExtractor:
    """Extract readable content from a public website."""

    async def extract(self, url: str) -> dict:
        await _validate_url(url)

        headers = {
            "User-Agent": (
                "Mozilla/5.0 "
                "(Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "Chrome/138.0 Safari/537.36"
            )
        }

        current_url = url
        async with httpx.AsyncClient(timeout=30) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                response = await client.get(current_url, headers=headers, follow_redirects=False)

                if response.is_redirect:
                    next_url = response.headers.get("location")
                    if not next_url:
                        break
                    current_url = str(client.build_request("GET", next_url, headers=headers).url)
                    await _validate_url(current_url)
                    continue

                break
            else:
                raise ValidationError("Too many redirects")

        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # <title> is not a body text node the SDK translates (it's in SKIP_TAGS),
        # so keep it as separate metadata rather than a content key.
        title = soup.title.get_text(strip=True) if soup.title else ""

        # Walk text nodes like the SDK does (body only; head has no translatable
        # DOM text). One key per text node, de-duplicated on identical text
        # (identical text -> identical sdk_hash_text key anyway).
        root = soup.body or soup
        content: list[str] = []
        seen: set[str] = set()
        for text in _sdk_text_nodes(root):
            if text not in seen:
                seen.add(text)
                content.append(text)

        return {
            "url": url,
            "title": title,
            "content": content,
        }
