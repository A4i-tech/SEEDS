from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from functools import cache
from typing import TYPE_CHECKING

import openai
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import AzureError

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


class AzureTranslationProvider(TranslationProvider):
    def __init__(self, key: str, region: str) -> None:
        if not key:
            raise ValueError("Azure Translator requires a subscription key (AZURE_TRANSLATION_KEY).")
        if not region:
            raise ValueError("Azure Translator requires a region (TTS_REGION).")
        try:
            from azure.ai.translation.text.aio import TextTranslationClient
        except ImportError as exc:
            raise RuntimeError(
                "TRANSLATION_PROVIDER=azure needs the azure-ai-translation-text package. "
                "Install it with `poetry install --extras azure`."
            ) from exc
        self._client = TextTranslationClient(
            credential=AzureKeyCredential(key), region=region, retry_total=_MAX_ATTEMPTS - 1
        )

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        return (await self.translate_batch([text], source_lang, target_lang))[0]

    async def translate_batch(
        self, texts: list[str], source_lang: str, target_lang: str
    ) -> list[str]:
        results: list[str] = []
        for chunk in _chunk_for_request(texts):
            results.extend(await self._request(chunk, source_lang, target_lang))
        return results

    async def _request(self, texts: list[str], source_lang: str, target_lang: str) -> list[str]:
        try:
            data = await self._client.translate(
                body=texts, to_language=[target_lang], from_language=source_lang or None
            )
        except AzureError as exc:
            status = getattr(exc, "status_code", None)
            if status is not None and status not in _TRANSIENT_STATUS_CODES:
                raise
            logger.warning("Azure Translator failed after %d attempts (%s); skipping item(s)", _MAX_ATTEMPTS, exc)
            raise TransientTranslationError(str(exc)) from exc
        return [item.translations[0].text for item in data]


_OPENAI_SYSTEM_PROMPT = (
    "Translate every string in `texts` from {source} to {target}. "
    "Keep the order and the count. Keep placeholders, markup and numbers unchanged. "
    'Return only JSON in the form {{"translations": ["..."]}}.'
)


class OpenAITranslationProvider(TranslationProvider):
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        if not model:
            raise ValueError("OpenAI translation requires a model name (TRANSLATION_MODEL).")
        self._client = openai.AsyncOpenAI(
            base_url=base_url, api_key=api_key or "unused", max_retries=_MAX_ATTEMPTS - 1, timeout=60
        )
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
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": _OPENAI_SYSTEM_PROMPT.format(source=source, target=target_lang),
                    },
                    {"role": "user", "content": json.dumps({"texts": texts}, ensure_ascii=False)},
                ],
            )
        except (openai.APIConnectionError, openai.APIStatusError) as exc:
            if isinstance(exc, openai.APIStatusError) and exc.status_code not in _TRANSIENT_STATUS_CODES:
                raise
            logger.warning("OpenAI translation failed after %d attempts (%s); skipping item(s)", _MAX_ATTEMPTS, exc)
            raise TransientTranslationError(str(exc)) from exc
        try:
            translations = json.loads(response.choices[0].message.content)["translations"]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            message = (
                f"OpenAI translation reply is not the expected JSON ({exc}). "
                "Check that TRANSLATION_MODEL supports JSON output."
            )
            logger.warning(message)
            raise TransientTranslationError(message) from exc
        if not isinstance(translations, list) or len(translations) != len(texts) or not all(isinstance(t, str) for t in translations):
            message = (
                f"OpenAI translation returned the wrong number or type of items (sent {len(texts)}). "
                "Retry, or use a more capable TRANSLATION_MODEL."
            )
            logger.warning(message)
            raise TransientTranslationError(message)
        return translations


@cache
def _openai_provider(base_url: str, api_key: str, model: str) -> OpenAITranslationProvider:
    return OpenAITranslationProvider(base_url, api_key, model)


@cache
def _azure_provider(key: str, region: str) -> AzureTranslationProvider:
    return AzureTranslationProvider(key, region)


def get_translation_provider(settings: Settings) -> TranslationProvider:
    if settings.translation_provider == "azure":
        return _azure_provider(settings.azure_translation_key, settings.azure_translation_region)
    return _openai_provider(
        settings.translation_effective_base_url,
        settings.translation_effective_api_key,
        settings.translation_model,
    )
