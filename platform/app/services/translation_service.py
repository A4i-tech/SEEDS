from __future__ import annotations

import logging

from groq import Groq

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)


class TranslationService:
    """Translate website content using Groq."""

    def __init__(self) -> None:
        settings = get_settings()

        if not settings.groq_api_key:
            raise ValueError(
                "GROQ_API_KEY is not configured in the Platform .env file."
            )

        self.client = Groq(
            api_key=settings.groq_api_key,
        )

        self.model = (
            settings.groq_model
            or "llama-3.3-70b-versatile"
        )

    async def translate(
        self,
        text: str,
        target_language: str,
    ) -> str:
        """
        Translate extracted website content into the target language.
        """

        prompt = f"""
You are a professional website translator.

Translate the following website content into {target_language}.

Rules:
- Preserve the meaning.
- Do NOT summarize.
- Keep headings as headings.
- Keep bullet points.
- Preserve numbering.
- Return ONLY the translated text.
- Do not include explanations.
- Do not wrap the output in markdown.

Website Content:

{text}
"""

        try:
            logger.info(
                "Starting Groq translation | Model=%s | Language=%s",
                self.model,
                target_language,
            )

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                temperature=0.2,
            )

            translated = (
                response.choices[0]
                .message
                .content
            )

            logger.info("Groq translation completed successfully.")

            return translated

        except Exception as exc:
            logger.exception("Groq translation failed")
            raise RuntimeError(
                f"Groq translation failed: {exc}"
            ) from exc