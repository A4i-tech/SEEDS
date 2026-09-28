from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

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


_AZURE_TRANSIENT_STATUS_CODES = {408, 429, 500, 502, 503, 504}
_AZURE_MAX_ATTEMPTS = 3
_AZURE_BASE_BACKOFF_SECONDS = 1.0


class AzureTranslationProvider(TranslationProvider):

    _API_VERSION = "3.0"
    _DEFAULT_ENDPOINT = "https://api.cognitive.microsofttranslator.com"
    _MAX_BATCH_ITEMS = 100
    _MAX_BATCH_CHARS = 50_000

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
        for chunk in self._chunk_for_request(texts):
            results.extend(await self._translate_batch_request(chunk, source_lang, target_lang))
        return results

    def _chunk_for_request(self, texts: list[str]) -> list[list[str]]:
        chunks: list[list[str]] = []
        current: list[str] = []
        current_chars = 0
        for text in texts:
            if current and (
                len(current) >= self._MAX_BATCH_ITEMS or current_chars + len(text) > self._MAX_BATCH_CHARS
            ):
                chunks.append(current)
                current, current_chars = [], 0
            current.append(text)
            current_chars += len(text)
        if current:
            chunks.append(current)
        return chunks

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

        last_error: Exception | None = None
        for attempt in range(_AZURE_MAX_ATTEMPTS):
            try:
                async with aiohttp.ClientSession() as session, session.post(
                    url, params=params, json=body, headers=headers
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return [item["translations"][0]["text"] for item in data]
                    error_text = await resp.text()
                    if resp.status not in _AZURE_TRANSIENT_STATUS_CODES:
                        raise RuntimeError(f"Azure Translator error {resp.status}: {error_text}")
                    last_error = RuntimeError(f"Azure Translator error {resp.status}: {error_text}")
            except (aiohttp.ClientError, TimeoutError) as exc:
                last_error = exc

            if attempt < _AZURE_MAX_ATTEMPTS - 1:
                await asyncio.sleep(_AZURE_BASE_BACKOFF_SECONDS * (2**attempt))

        logger.warning(
            "Azure translation failed after %d attempts (%s); skipping item(s)",
            _AZURE_MAX_ATTEMPTS,
            last_error,
        )
        raise TransientTranslationError(str(last_error))


def get_translation_provider(settings: Settings) -> TranslationProvider:
    return AzureTranslationProvider(
        settings.azure_translation_key,
        settings.azure_translation_region,
    )
