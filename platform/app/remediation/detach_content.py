from __future__ import annotations

from pathlib import Path

from omni_ingest.core.model import ByteContent, ResolvedResource, Step, StepResult, StepStatus
from omni_ingest.core.pipeline import IngestionContext, register_step

ENGINE_NAME = "detach_content"


class DetachContentAgent(Step):
    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        detached_dir = Path(ctx.metadata["workspace"]) / "out" / "detached"
        detached_dir.mkdir(parents=True, exist_ok=True)
        for item in ctx.items:
            if item.metadata.get("kind") != "image":
                continue
            content = await item.content.read(ctx)
            path = detached_dir / f"{item.id}.bin"
            path.write_bytes(content)
            item.metadata["content_path"] = str(path.resolve())
            item.content = ByteContent()
        ctx.resource.content = ByteContent()
        return StepResult(status=StepStatus.SUCCESS, items=ctx.items)


register_step(ENGINE_NAME, DetachContentAgent)
