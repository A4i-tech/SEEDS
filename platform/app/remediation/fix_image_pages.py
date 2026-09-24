from __future__ import annotations

from omni_ingest.core.model import ResolvedResource, Step, StepResult, StepStatus
from omni_ingest.core.pipeline import IngestionContext, register_step

ENGINE_NAME = "fix_image_pages"

# A cropped region shorter than this (in PDF points) is a caption label line
# ("ಚಿತ್ರ 7.3"), not a diagram: cluster_drawings() mistakes these glyphs
# for vector art when the source PDF has embedded them as outline paths.
MIN_FIGURE_HEIGHT_PT = 40


class FixImagePagesAgent(Step):
    """Corrects image items produced by ImageExtractionAgent.

    ImageExtractionAgent runs on already-split single-page PDFs, so it always
    numbers each page it finds as page 1. Restore the real page number from
    each image's parent item, which page_chunking numbered correctly.

    Also drops image items whose bbox is too short to be a real figure.
    """

    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        page_by_id = {str(item.id): item.metadata.get("page") for item in ctx.items}
        kept = []
        for item in ctx.items:
            if item.metadata.get("kind") != "image":
                kept.append(item)
                continue
            bbox = item.metadata.get("bbox") or []
            if len(bbox) == 4 and (bbox[3] - bbox[1]) < MIN_FIGURE_HEIGHT_PT:
                continue
            real_page = page_by_id.get(str(item.metadata.get("parent_id")))
            if real_page is not None:
                item.metadata["page"] = real_page
            kept.append(item)
        ctx.items = kept
        return StepResult(status=StepStatus.SUCCESS, items=ctx.items)


register_step(ENGINE_NAME, FixImagePagesAgent)
