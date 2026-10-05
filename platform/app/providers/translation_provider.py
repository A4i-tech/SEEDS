from __future__ import annotations

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

import aiohttp

if TYPE_CHECKING:
    from app.platform.settings import Settings

logger = logging.getLogger(__name__)


class TransientTranslationError(RuntimeError):
    pass


class TranslationProvider(ABC):
    @abstractmethod
    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        ...

    async def translate_batch(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        return [await self.translate(t, source_lang, target_lang) for t in texts]


_TRANSIENT_STATUS_CODES = {408, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 3
_BASE_BACKOFF_SECONDS = 1.0
_MAX_BATCH_ITEMS = 100
_MAX_BATCH_CHARS = 50_000


def _chunk_for_request(texts: list[str]) -> list[list[str]]:
    chunks: list[list[str]] = []
    current: list[str] = []
    current_chars = 0
    for text in texts:
        if current and (len(current) >= _MAX_BATCH_ITEMS or current_chars + len(text) > _MAX_BATCH_CHARS):
            chunks.append(current)
            current, current_chars = [], 0
        current.append(text)
        current_chars += len(text)
    if current:
        chunks.append(current)
    return chunks


async def _post_json_with_retry(label: str, url: str, **request_kwargs: Any) -> Any:
    last_error: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            async with aiohttp.ClientSession() as session, session.post(url, **request_kwargs) as resp:
                if resp.status == 200:
                    return await resp.json(content_type=None)
                error_text = await resp.text()
                if resp.status not in _TRANSIENT_STATUS_CODES:
                    raise RuntimeError(f"{label} error {resp.status}: {error_text}")
                last_error = RuntimeError(f"{label} error {resp.status}: {error_text}")
        except (aiohttp.ClientError, TimeoutError) as exc:
            last_error = exc

        if attempt < _MAX_ATTEMPTS - 1:
            await asyncio.sleep(_BASE_BACKOFF_SECONDS * (2**attempt))

    logger.warning("%s failed after %d attempts (%s); skipping item(s)", label, _MAX_ATTEMPTS, last_error)
    raise TransientTranslationError(str(last_error))


class AzureTranslationProvider(TranslationProvider):

    _API_VERSION = "3.0"
    _DEFAULT_ENDPOINT = "https://api.cognitive.microsofttranslator.com"

    def __init__(self, key: str, region: str, endpoint: str = "") -> None:
        if not key:
            raise ValueError("Azure Translator requires a subscription key (AZURE_TRANSLATION_KEY).")
        if not region:
            raise ValueError("Azure Translator requires a region (TTS_REGION).")
        self._key = key
        self._region = region
        self._endpoint = (endpoint or self._DEFAULT_ENDPOINT).rstrip("/")

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        results = await self.translate_batch([text], source_lang, target_lang)
        return results[0]

    async def translate_batch(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        if not texts:
            return []

        results: list[str] = []
        for chunk in _chunk_for_request(texts):
            results.extend(await self._translate_batch_request(chunk, source_lang, target_lang))
        return results

    async def _translate_batch_request(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        url = f"{self._endpoint}/translate"
        params = {"api-version": self._API_VERSION, "to": target_lang}
        if source_lang:
            params["from"] = source_lang
        headers = {
            "Ocp-Apim-Subscription-Key": self._key,
            "Ocp-Apim-Subscription-Region": self._region,
            "Content-Type": "application/json",
        }
        body = [{"Text": t} for t in texts]
        data = await _post_json_with_retry(
            "Azure Translator", url, params=params, json=body, headers=headers
        )
        return [item["translations"][0]["text"] for item in data]


_OPENAI_SYSTEM_PROMPT = (
    "Translate every string in `texts` from {source} to {target}. "
    "Keep the order and the count. Keep placeholders, markup and numbers unchanged. "
    'Return only JSON in the form {{"translations": ["..."]}}.'
)


class OpenAITranslationProvider(TranslationProvider):
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        if not model:
            raise ValueError("OpenAI translation requires a model name (TRANSLATION_MODEL).")
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._api_key = api_key
        self._model = model

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        return (await self.translate_batch([text], source_lang, target_lang))[0]

    async def translate_batch(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        results = list(texts)
        indexes = [i for i, t in enumerate(texts) if t.strip()]
        done = 0
        for chunk in _chunk_for_request([texts[i] for i in indexes]):
            for offset, out in enumerate(await self._request(chunk, source_lang, target_lang)):
                results[indexes[done + offset]] = out
            done += len(chunk)
        return results

    async def _request(self, texts: list[str], source_lang: str, target_lang: str) -> list[str]:
        source = source_lang if source_lang and source_lang != "auto" else "the language you detect"
        body = {
            "model": self._model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": _OPENAI_SYSTEM_PROMPT.format(source=source, target=target_lang),
                },
                {"role": "user", "content": json.dumps({"texts": texts}, ensure_ascii=False)},
            ],
        }
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        data = await _post_json_with_retry("OpenAI translation", self._url, json=body, headers=headers)
        try:
            translations = json.loads(data["choices"][0]["message"]["content"])["translations"]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise TransientTranslationError(
                f"OpenAI translation reply is not the expected JSON ({exc}). "
                "Check that TRANSLATION_MODEL supports JSON output."
            ) from exc
        if not isinstance(translations, list) or len(translations) != len(texts) or not all(isinstance(t, str) for t in translations):
            raise TransientTranslationError(
                f"OpenAI translation returned the wrong number or type of items (sent {len(texts)}). "
                "Retry, or use a more capable TRANSLATION_MODEL."
            )
        return translations


def get_translation_provider(settings: Settings) -> TranslationProvider:
    if settings.translation_provider == "azure":
        return AzureTranslationProvider(
            settings.azure_translation_key,
            settings.azure_translation_region,
        )
    return OpenAITranslationProvider(
        settings.translation_effective_base_url,
        settings.translation_effective_api_key,
        settings.translation_model,
    )
