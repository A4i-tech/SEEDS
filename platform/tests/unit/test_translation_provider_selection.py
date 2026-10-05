from __future__ import annotations

import json

import aiohttp
import pytest
from aiohttp import web
from pydantic import ValidationError

from app.platform.settings import Settings
from app.providers import translation_provider as tp
from app.providers.translation_provider import (
    AzureTranslationProvider,
    OpenAITranslationProvider,
    TransientTranslationError,
    get_translation_provider,
)

MOCK_URL = "http://localhost:8000/v1"


@pytest.fixture
async def mock_server():
    try:
        async with aiohttp.ClientSession() as s, s.get(f"{MOCK_URL}/models", timeout=aiohttp.ClientTimeout(total=2)):
            pass
    except (aiohttp.ClientError, TimeoutError, OSError):
        pytest.skip("mock model server at http://localhost:8000/v1 does not answer")


@pytest.fixture
def no_sleep(monkeypatch):
    async def _instant(_seconds):
        return None

    monkeypatch.setattr(tp.asyncio, "sleep", _instant)


@pytest.fixture
async def local_server():
    runners: list[web.AppRunner] = []

    async def start(handler) -> str:
        app = web.Application()
        app.router.add_post("/v1/chat/completions", handler)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        runners.append(runner)
        port = site._server.sockets[0].getsockname()[1]
        return f"http://127.0.0.1:{port}/v1"

    yield start
    for r in runners:
        await r.cleanup()


def _reply(content) -> web.Response:
    text = content if isinstance(content, str) else json.dumps(content)
    return web.json_response({"choices": [{"message": {"content": text}}]})


async def test_openai_translate_against_mock(mock_server):
    provider = OpenAITranslationProvider(MOCK_URL, "any", "any")
    assert await provider.translate("hello", "en", "hi") == "[mock] hello"
    assert await provider.translate("hello", "auto", "hi") == "[mock] hello"


async def test_openai_batch_over_limit_keeps_order(mock_server):
    provider = OpenAITranslationProvider(MOCK_URL, "any", "any")
    texts = [f"t{i}" for i in range(tp._MAX_BATCH_ITEMS * 2 + 5)]
    assert await provider.translate_batch(texts, "en", "hi") == [f"[mock] {t}" for t in texts]


async def test_openai_empty_strings_skip_server(mock_server):
    provider = OpenAITranslationProvider(MOCK_URL, "any", "any")
    out = await provider.translate_batch(["", "a", "   ", "b"], "en", "hi")
    assert out == ["", "[mock] a", "   ", "[mock] b"]


async def test_openai_only_empty_strings_sends_no_request():
    provider = OpenAITranslationProvider("http://127.0.0.1:1/v1", "k", "m")
    assert await provider.translate_batch(["", " "], "en", "hi") == ["", " "]


async def test_openai_request_shape(local_server):
    seen: list[dict] = []

    async def handler(request):
        seen.append(await request.json())
        return _reply({"translations": ["x"]})

    provider = OpenAITranslationProvider(await local_server(handler), "k", "m")
    await provider.translate("ಹೆಲೋ", "auto", "hi")
    body = seen[0]
    assert body["temperature"] == 0
    assert body["response_format"] == {"type": "json_object"}
    assert body["messages"][1]["content"] == json.dumps({"texts": ["ಹೆಲೋ"]}, ensure_ascii=False)
    assert "detect" in body["messages"][0]["content"]


async def test_openai_wrong_length_reply_raises(local_server):
    async def handler(request):
        return _reply({"translations": ["only one"]})

    provider = OpenAITranslationProvider(await local_server(handler), "k", "m")
    with pytest.raises(TransientTranslationError, match="wrong number"):
        await provider.translate_batch(["a", "b"], "en", "hi")


@pytest.mark.parametrize("content", ["not json", {"other": []}, {"translations": "str"}, {"translations": [None]}])
async def test_openai_invalid_reply_raises(local_server, content):
    async def handler(request):
        return _reply(content)

    provider = OpenAITranslationProvider(await local_server(handler), "k", "m")
    with pytest.raises(TransientTranslationError):
        await provider.translate("a", "en", "hi")


async def test_openai_retries_on_500(local_server, no_sleep):
    calls = {"n": 0}

    async def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return web.Response(status=500, text="boom")
        return _reply({"translations": ["ok"]})

    provider = OpenAITranslationProvider(await local_server(handler), "k", "m")
    assert await provider.translate("a", "en", "hi") == "ok"
    assert calls["n"] == 3


async def test_openai_gives_up_after_max_attempts(local_server, no_sleep):
    calls = {"n": 0}

    async def handler(request):
        calls["n"] += 1
        return web.Response(status=500, text="boom")

    provider = OpenAITranslationProvider(await local_server(handler), "k", "m")
    with pytest.raises(TransientTranslationError):
        await provider.translate("a", "en", "hi")
    assert calls["n"] == tp._MAX_ATTEMPTS


def test_selector_openai():
    settings = Settings(translation_provider="openai", translation_model="m")
    assert isinstance(get_translation_provider(settings), OpenAITranslationProvider)


def test_selector_azure():
    settings = Settings(translation_provider="azure", azure_translation_key="k", tts_region="r")
    assert isinstance(get_translation_provider(settings), AzureTranslationProvider)


def test_default_provider_is_openai():
    assert Settings().translation_provider == "openai"


def test_unknown_provider_fails_at_load():
    with pytest.raises(ValidationError, match="Set it to 'azure' or 'openai'"):
        Settings(translation_provider="deepl")


def test_openai_requires_model():
    with pytest.raises(ValidationError, match="TRANSLATION_MODEL is empty"):
        Settings(translation_provider="openai", translation_model="")


@pytest.mark.parametrize("key,region", [("", "r"), ("k", "")])
def test_azure_requires_key_and_region(key, region):
    with pytest.raises(ValidationError, match="AZURE_TRANSLATION_KEY and TTS_REGION"):
        Settings(translation_provider="azure", azure_translation_key=key, tts_region=region)


def test_base_url_and_key_fallbacks():
    s = Settings(translation_model="m", openai_base_url="http://o/v1", openai_api_key="ok")
    assert s.translation_effective_base_url == "http://o/v1"
    assert s.translation_effective_api_key == "ok"
    s = Settings(translation_model="m", translation_base_url="http://t/v1", translation_api_key="tk",
                 openai_base_url="http://o/v1", openai_api_key="ok")
    assert s.translation_effective_base_url == "http://t/v1"
    assert s.translation_effective_api_key == "tk"
    assert Settings(translation_model="m", openai_base_url="").translation_effective_base_url == "https://api.openai.com/v1"
