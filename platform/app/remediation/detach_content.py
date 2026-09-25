from __future__ import annotations

from pathlib import Path

from omni_ingest.core.model import ResolvedResource, Step, StepResult, StepStatus
from omni_ingest.core.pipeline import IngestionContext, register_step

ENGINE_NAME = "detach_content"

_DETACHED_DIR = Path("out") / "detached"


class DetachContentAgent(Step):
    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        _DETACHED_DIR.mkdir(parents=True, exist_ok=True)
        for item in ctx.items:
            if item.metadata.get("kind") != "image":
                continue
            content = await item.content(ctx)
            path = _DETACHED_DIR / f"{item.id}.bin"
            path.write_bytes(content)
            item.metadata["content_path"] = str(path.resolve())
            item.raw_content = b""
            item.content_uri = None
        ctx.resource.raw_content = b""
        ctx.resource.content_uri = None
        return StepResult(status=StepStatus.SUCCESS, items=ctx.items)


register_step(ENGINE_NAME, DetachContentAgent)
