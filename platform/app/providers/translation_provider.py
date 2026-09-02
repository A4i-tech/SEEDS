from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

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


class _ChatCompletionsTranslationProvider(TranslationProvider):

    _API_URL: str
    _MODEL: str
    _PROVIDER_LABEL: str

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError(f"{self._PROVIDER_LABEL} requires an API key.")
        self._api_key = api_key

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        import aiohttp  # noqa: PLC0415

        prompt = (
            f"Translate the following text from {source_lang} to {target_lang}. "
            "Return ONLY the translated text, with no quotes, labels, or explanation.\n\n"
            f"{text}"
        )
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        }

        async with aiohttp.ClientSession() as session, session.post(
            self._API_URL, json=payload, headers=headers
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise RuntimeError(f"{self._PROVIDER_LABEL} translation error {resp.status}: {error_text}")
            data = await resp.json()

        return data["choices"][0]["message"]["content"].strip()


class OpenAITranslationProvider(_ChatCompletionsTranslationProvider):

    _API_URL = "https://api.openai.com/v1/chat/completions"
    _MODEL = "gpt-4o-mini"
    _PROVIDER_LABEL = "OpenAI"


_NON_TRANSIENT_STATUS_CODES = {401, 403, 404, 422}

_MAX_ATTEMPTS = 3
_BASE_BACKOFF_SECONDS = 1.0


class GroqTranslationProvider(_ChatCompletionsTranslationProvider):

    _API_URL = "https://api.groq.com/openai/v1/chat/completions"
    _PROVIDER_LABEL = "Groq"

    def __init__(self, api_key: str, model: str) -> None:
        super().__init__(api_key)
        self._MODEL = model

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        import asyncio  # noqa: PLC0415

        import aiohttp  # noqa: PLC0415

        last_error: Exception | None = None
        for attempt in range(_MAX_ATTEMPTS):
            try:
                return await super().translate(text, source_lang, target_lang)
            except RuntimeError as exc:
                status = self._extract_status_code(str(exc))
                if status is not None and status in _NON_TRANSIENT_STATUS_CODES:
                    raise
                last_error = exc
            except (aiohttp.ClientError, TimeoutError) as exc:
                last_error = exc

            if attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(_BASE_BACKOFF_SECONDS * (2**attempt))

        logger.warning(
            "Groq translation failed after %d attempts (%s); skipping item", _MAX_ATTEMPTS, last_error
        )
        raise TransientTranslationError(str(last_error))

    @staticmethod
    def _extract_status_code(error_message: str) -> int | None:
        import re  # noqa: PLC0415

        match = re.match(r"Groq translation error (\d+):", error_message)
        return int(match.group(1)) if match else None


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
            raise ValueError("Azure Translator requires a subscription key (TRANSLATOR_KEY).")
        if not region:
            raise ValueError("Azure Translator requires a region (TRANSLATOR_REGION).")
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
        import asyncio  # noqa: PLC0415

        import aiohttp  # noqa: PLC0415

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


class _StubTranslationProvider(TranslationProvider):

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        return f"[{target_lang}] {text}"


def get_translation_provider(settings: Settings) -> TranslationProvider:
    provider_name = (settings.translation_provider or "openai").lower()

    if provider_name == "openai":
        return OpenAITranslationProvider(settings.openai_api_key)
    if provider_name == "groq":
        return GroqTranslationProvider(settings.groq_api_key, settings.groq_model)
    if provider_name == "azure":
        return AzureTranslationProvider(
            settings.translator_key,
            settings.translator_region,
            settings.translator_endpoint,
        )
    if provider_name == "stub":
        return _StubTranslationProvider()

    raise ValueError(f"Unsupported translation_provider: {provider_name!r}")
