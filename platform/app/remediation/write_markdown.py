"""Joins OCR'd page items into one Markdown file.

OmniIngest's output writers cover json, pkl, brf, vector and graph, but not a
plain `.md` file — the markdown is there, wrapped in JSON. This step is the seam
between OCR and everything downstream: it writes the artifact the review agent
reads.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from omni_ingest.core.pipeline import IngestionContext

from omni_ingest.core.model import ResolvedResource, Step, StepResult, StepStatus
from omni_ingest.core.pipeline import register_step


def order_pages(pages: list[int]) -> list[int]:
    """Sorted page numbers. Raises when the run has a hole in it."""
    if not pages:
        raise ValueError("No pages to write")
    if len(set(pages)) != len(pages):
        raise ValueError(f"Duplicate pages: {sorted(p for p in set(pages) if pages.count(p) > 1)}")
    ordered = sorted(pages)
    missing = set(range(ordered[0], ordered[-1] + 1)) - set(ordered)
    if missing:
        raise ValueError(f"Pages missing from the run: {sorted(missing)}")
    return ordered


class WriteMarkdownAgent(BaseModel, Step):
    """Writes text items to a single Markdown file, ordered by page."""

    out: Path = Field(default=Path("out/raw.md"), description="Path the Markdown is written to")
    separator: str = Field(default="\n\n", description="Text placed between pages")

    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        pages = {}
        for item in ctx.items:
            if not (await item.content_type(ctx)).startswith("text/"):
                continue
            page = item.metadata.get("page")
            if page is None:
                raise ValueError(f"Item {item.id} has no page metadata; run page_chunking first")
            pages[int(page)] = await item.decode(ctx)

        ordered = order_pages(list(pages))
        markdown = self.separator.join(pages[page] for page in ordered)

        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.out.write_text(markdown, encoding="utf-8")

        ctx.metadata["markdown"] = {"path": str(self.out), "pages": len(ordered), "chars": len(markdown)}
        return StepResult(status=StepStatus.SUCCESS, items=ctx.items, output_paths={"markdown": str(self.out)},
                          metadata={"pages": len(ordered), "chars": len(markdown)})


register_step("write_markdown", WriteMarkdownAgent)
