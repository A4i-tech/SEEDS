from __future__ import annotations

import socket

import httpx
import pytest

from app.platform.error_handling import ValidationError
from app.services import website_extractor
from app.services.website_extractor import (
    WebsiteExtractor,
    _sdk_is_translatable,
    _validate_url,
)

pytestmark = pytest.mark.asyncio


def _fake_addrinfo(ip: str):
    def _getaddrinfo(host, port):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]

    return _getaddrinfo


@pytest.mark.parametrize(
    "url",
    ["http://example.com", "https://example.com/page"],
)
async def test_validate_url_allows_public_address(monkeypatch, url):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_addrinfo("93.184.216.34"))
    await _validate_url(url)  # no raise


@pytest.mark.parametrize(
    "url,ip",
    [
        ("http://localhost", "127.0.0.1"),
        ("http://internal.example", "127.0.0.1"),
        ("http://169.254.169.254", "169.254.169.254"),  # cloud metadata endpoint
        ("http://10.0.0.1", "10.0.0.1"),
        ("http://192.168.1.1", "192.168.1.1"),
    ],
)
async def test_validate_url_blocks_private_and_link_local(monkeypatch, url, ip):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_addrinfo(ip))
    with pytest.raises(ValidationError):
        await _validate_url(url)


async def test_validate_url_blocks_disallowed_scheme():
    with pytest.raises(ValidationError):
        await _validate_url("ftp://example.com")


async def test_validate_url_requires_hostname():
    with pytest.raises(ValidationError):
        await _validate_url("http:///path")


async def test_extract_fetches_and_parses_public_page(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_addrinfo("93.184.216.34"))

    html = "<html><head><title>Hi</title></head><body><h1>Hello</h1><p>World</p></body></html>"

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=html)

    transport = httpx.MockTransport(_handler)
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        website_extractor.httpx,
        "AsyncClient",
        lambda **kwargs: real_async_client(transport=transport, **kwargs),
    )

    result = await WebsiteExtractor().extract("http://example.com")
    assert result["title"] == "Hi"
    assert "Hello" in result["content"]
    assert "World" in result["content"]


async def _extract_html(monkeypatch, html: str) -> dict:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_addrinfo("93.184.216.34"))

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=html)

    transport = httpx.MockTransport(_handler)
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        website_extractor.httpx,
        "AsyncClient",
        lambda **kwargs: real_async_client(transport=transport, **kwargs),
    )
    return await WebsiteExtractor().extract("http://example.com")


# ---------------------------------------------------------------------------
# PR #276 blocker #4 — the extractor must key content the SAME way the SDK
# does: ONE key per text node, so text inside inline elements (<b>, <a>, ...)
# is its own key. The SDK walks the DOM with TreeWalker(SHOW_TEXT) and hashes
# each node.textContent.trim() separately (sdk.js registerNode); collapsing an
# element into a single string yields a key the SDK never generates, so the
# persisted translation never renders for markup like "<p>Hi <b>there</b></p>".
# ---------------------------------------------------------------------------


def _sdk_side_text_nodes(*texts: str) -> list[str]:
    """The trimmed, translatable text nodes the SDK would register, in order."""
    return [t.strip() for t in texts if _sdk_is_translatable(t)]


async def test_extract_splits_inline_element_into_separate_text_nodes(monkeypatch):
    html = "<html><body><p>Hello <b>world</b></p></body></html>"
    result = await _extract_html(monkeypatch, html)
    # Two text nodes -> two keys, exactly what the SDK registers.
    assert result["content"] == ["Hello", "world"]


async def test_extract_inline_markup_with_trailing_text_node(monkeypatch):
    # <p> yields three text nodes: "Hello", "world", "!" — the SDK registers
    # all three ("!" is not numeric/punctuation-only per isTranslatable).
    html = "<html><body><p>Hello<b>world</b>!</p></body></html>"
    result = await _extract_html(monkeypatch, html)
    assert result["content"] == ["Hello", "world", "!"]


async def test_extract_plain_text_element_unaffected(monkeypatch):
    html = "<html><body><p>Just plain text</p></body></html>"
    result = await _extract_html(monkeypatch, html)
    assert result["content"] == ["Just plain text"]


async def test_extract_keys_match_sdk_per_node_keys(monkeypatch):
    """Each extracted string hashes to the same key the SDK computes from the
    corresponding live-DOM text node (node.textContent.trim())."""
    from app.services.sdk_hash import sdk_hash_text

    html = "<html><body><p>Hello <b>world</b></p></body></html>"
    result = await _extract_html(monkeypatch, html)

    # SDK side: two separate text nodes "Hello " and "world".
    sdk_side = _sdk_side_text_nodes("Hello ", "world")
    assert result["content"] == sdk_side
    assert [sdk_hash_text(t) for t in result["content"]] == [
        sdk_hash_text(t) for t in sdk_side
    ]


async def test_extract_skips_non_translatable_skip_tags_and_opt_out(monkeypatch):
    html = (
        "<html><body>"
        "<p>Keep me</p>"
        "<p>12.5%</p>"                            # numeric/punctuation-only -> skipped
        "<style>.x{color:red}</style>"            # SKIP tag -> skipped
        "<span data-no-translate>secret</span>"   # opted out -> skipped
        "</body></html>"
    )
    result = await _extract_html(monkeypatch, html)
    assert result["content"] == ["Keep me"]


async def test_extract_rejects_redirect_to_blocked_target(monkeypatch):
    # First hop resolves publicly; the redirect target resolves to a blocked
    # (loopback) address and must be rejected before it's ever fetched.
    call_count = {"n": 0}

    def _getaddrinfo(host, port):
        call_count["n"] += 1
        ip = "93.184.216.34" if call_count["n"] == 1 else "127.0.0.1"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _getaddrinfo)

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://internal.example/secret"})

    transport = httpx.MockTransport(_handler)
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        website_extractor.httpx,
        "AsyncClient",
        lambda **kwargs: real_async_client(transport=transport, **kwargs),
    )

    with pytest.raises(ValidationError):
        await WebsiteExtractor().extract("http://example.com")
