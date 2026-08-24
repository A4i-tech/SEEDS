"""Translates image alt text in OCR Markdown into the book's language.

The OCR prompt describes figures in English whatever the textbook's language, so
a Kannada book comes back with English alt text — useless to the reader the alt
text exists for. This step rewrites the text inside `![...]` and nothing else.

It runs *before* `postcorrect`, deliberately. Postcorrect treats an image
reference as a protected span that its audit may never touch, so translating
first means the translated text is protected for the rest of the run rather than
becoming an audit target.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field, PositiveInt
from pydantic_ai import NativeOutput

if TYPE_CHECKING:
    from omni_ingest.core.pipeline import IngestionContext

from omni_ingest.core.model import AgentMixin, ResolvedResource, Step, StepResult, StepStatus
from omni_ingest.core.pipeline import register_step

_IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")

TRANSLATE_PROMPT = """You are translating figure descriptions from a school textbook.

Each numbered line is the alt text of one figure — the description a blind
student hears in place of the image.

Rules:
* Translate into {language}. Return one translation per input, in the same
  order, and exactly as many as you were given.
* Keep numbers, units, chemical formulae and mathematical symbols unchanged.
* Translate the description, do not summarise, expand or improve it.
* If a line is already in {language}, return it unchanged."""


class Translations(BaseModel):
    texts: list[str] = Field(default_factory=list)


def alt_spans(text: str) -> list[tuple[int, int, str, str]]:
    """(start, end, alt, src) for every image whose alt text is worth translating."""
    return [(m.start(1), m.end(1), m.group(1), m.group(2)) for m in _IMAGE.finditer(text) if m.group(1).strip()]


def replace_alts(text: str, spans: list[tuple[int, int, str, str]], translations: list[str]) -> str:
    """Rewrites alt text in place. `src` is outside every span, so it cannot move."""
    if len(spans) != len(translations):
        raise ValueError(f"Got {len(translations)} translations for {len(spans)} images")
    for (start, end, *_), translated in zip(reversed(spans), reversed(translations), strict=True):
        text = text[:start] + translated + text[end:]
    return text


class AltTranslateAgent(BaseModel, Step, AgentMixin):
    """Translates the alt text of every image reference into the target language."""

    language: str = Field(default="en", description="Language the alt text is translated into")
    source_language: str = Field(default="en", description="Language the OCR wrote alt text in; a match makes this step a no-op")
    out_dir: Path = Field(default=Path("out"), description="Directory for the translation trail")
    batch_size: PositiveInt = Field(default=20, description="Alt texts sent per model call")

    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        if self.language.lower() == self.source_language.lower():
            return StepResult(status=StepStatus.SKIPPED, items=ctx.items,
                              metadata={"reason": f"source and target are both {self.language}"})

        self.out_dir.mkdir(parents=True, exist_ok=True)
        agent = self._agent(ctx, output_type=NativeOutput(Translations, strict=True))
        paths, translated = {}, 0

        for item in ctx.items:
            if not (await item.content_type(ctx)).startswith("text/"):
                continue
            text = await item.decode(ctx)
            spans = alt_spans(text)
            if not spans:
                continue

            ctx.progress(0, len(spans), "translating alt text")
            texts: list[str] = []
            for start in range(0, len(spans), self.batch_size):
                batch = [alt for _, _, alt, _ in spans[start:start + self.batch_size]]
                numbered = "\n".join(f"{n}. {alt}" for n, alt in enumerate(batch, 1))
                async with agent:
                    result = await agent.run([TRANSLATE_PROMPT.format(language=self.language), numbered])
                if len(result.output.texts) != len(batch):
                    raise ValueError(f"Model returned {len(result.output.texts)} translations for {len(batch)} alt texts")
                texts.extend(result.output.texts)
                ctx.progress(len(texts), len(spans), f"translated {len(texts)}/{len(spans)}")

            output = replace_alts(text, spans, texts)
            if len(_IMAGE.findall(output)) != len(_IMAGE.findall(text)):
                raise ValueError("Image reference count changed while translating alt text")

            item.raw_content = output.encode("utf-8")
            item.content_uri = None
            item.content_encoding = "utf-8"

            records: list[dict[str, Any]] = [
                {"stage": "alt_translate", "src": src, "original": alt, "translated": new, "language": self.language}
                for (_, _, alt, src), new in zip(spans, texts, strict=True)
            ]
            stem = Path(item.source_uri or str(item.id)).stem
            trail = self.out_dir / f"{stem}.alt.jsonl"
            trail.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
            paths[f"{stem}.alt"] = str(trail)

            item.metadata["alt_translation"] = {"count": len(spans), "language": self.language}
            translated += len(spans)

        return StepResult(status=StepStatus.SUCCESS, items=ctx.items, output_paths=paths,
                          metadata={"translated": translated, "language": self.language})


register_step("alt_translate", AltTranslateAgent)
