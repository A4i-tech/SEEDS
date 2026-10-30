from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from app.platform.settings import get_settings

# The only platform secrets the remediation/translation pipelines actually
# read (OCR + chat-completion model credentials). omni_ingest reads them from
# the environment when it is first imported, so set them before the imports below.
_REMEDIATION_SETTINGS_KEYS = (
    "openai_api_key",
    "mistral_ocr_api_key",
    "mistral_ocr_endpoint",
    "mistral_ocr_model",
    "azure_openai_api_key",
    "azure_openai_endpoint",
    "openai_api_version",
    "default_chat_completion_model",
    "azure_translation_key",
    "azure_translation_region",
)
_settings = get_settings()
os.environ.update({name.upper(): value for name in _REMEDIATION_SETTINGS_KEYS if (value := getattr(_settings, name))})

from collections.abc import Awaitable, Callable  # noqa: E402

from omni_ingest.core import event  # noqa: E402
from omni_ingest.core.config import settings as omni_settings  # noqa: E402, F401
from omni_ingest.core.model import Resource, StepStatus  # noqa: E402
from omni_ingest.core.output import json_dump_context  # noqa: E402
from omni_ingest.core.pipeline import IngestionContext, create_pipeline_from_config  # noqa: E402
from omni_ingest.port.metadata_store import NullMetadataStore  # noqa: E402
from pydantic import TypeAdapter  # noqa: E402

from app.remediation import (  # noqa: E402, F401
    detach_content,
    safe_extract,
)

logger = logging.getLogger(__name__)


def _progress_event(e: event.Event) -> dict[str, object] | None:
    if isinstance(e, event.PipelineStepBeginEvent):
        return {"type": "step_begin", "step_name": e.step_name, "message": f"Starting {e.step_name}"}
    if isinstance(e, event.PipelineStepProgressEvent):
        return {
            "type": "step_progress",
            "step_name": e.step_name,
            "completed": int(e.completed),
            "total": int(e.total),
            "message": e.message or f"{int(e.completed)}/{int(e.total)}",
        }
    if isinstance(e, event.PipelineStepEndEvent):
        return {"type": "step_end", "step_name": e.step_name, "status": e.step_result.status.value}
    return None


async def run_pipeline(
    pipeline_path: Path,
    resource: Path,
    workspace: Path,
    params: dict[str, Any],
    on_progress: Callable[[dict[str, object]], Awaitable[None]] | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Run an omni_ingest pipeline in this process and return its dumped context."""
    runner = create_pipeline_from_config(pipeline_path, config_args=params)
    root = IngestionContext(
        resource=TypeAdapter(Resource).validate_python(str(resource)),
        store=NullMetadataStore(),
        metadata={"workspace": str(workspace)},
    )
    [ctx] = [child async for child in runner.flatten(root)]
    last_step: str | None = None

    async def _forward_progress() -> None:
        nonlocal last_step
        try:
            async for e in event.subscribe(run_id=ctx.run_id, populate_with_buffered=False):
                if (evt := _progress_event(e)) is None:
                    continue
                last_step = str(evt["step_name"])
                if on_progress:
                    try:
                        await on_progress(evt)
                    except Exception as exc:
                        logger.warning("remediation: run_id=%s failed handling progress event: %s", ctx.run_id, exc)
        except Exception:
            logger.exception("remediation: run_id=%s progress listener stopped", ctx.run_id)

    listener = asyncio.create_task(_forward_progress())
    await asyncio.sleep(0)
    logger.info("remediation: pipeline %s started run_id=%s", pipeline_path.name, ctx.run_id)
    try:
        async with asyncio.timeout(timeout):
            results = await runner.run(ctx)
    except TimeoutError as exc:
        logger.error("remediation: pipeline %s run_id=%s timed out after %ss at step %s", pipeline_path.name, ctx.run_id, timeout, last_step)
        raise RuntimeError(
            f"Pipeline {pipeline_path.name} timed out after {timeout}s during step {last_step or 'an unknown step'}. "
            "Retry with a smaller PDF."
        ) from exc
    finally:
        event.shutdown(ctx.run_id)
        await listener

    failures = [r.error for r in results if r.status == StepStatus.FAILURE]
    if failures:
        logger.error("remediation: pipeline %s run_id=%s failed at step %s: %s", pipeline_path.name, ctx.run_id, last_step, failures)
        raise RuntimeError(
            f"Pipeline {pipeline_path.name} failed during step {last_step or 'an unknown step'}: "
            f"{'; '.join(str(f) for f in failures)}. Retry the job. If it fails again, send run ID {ctx.run_id} to an admin."
        )
    logger.info("remediation: pipeline %s finished run_id=%s", pipeline_path.name, ctx.run_id)
    return await json_dump_context(ctx)
