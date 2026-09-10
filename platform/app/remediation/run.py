"""OmniIngest's CLI with this package's steps registered, plus progress file support.

    python -m app.remediation.run app/remediation/textbook_ocr.yaml \
        --input book.pdf --output run.json [--progress-file progress.jsonl]

OmniIngest's CLI has no plugin hook, so the steps a pipeline names must already
be in the registry when it is built — importing this package does that.
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from omni_ingest.cli import _main
from omni_ingest.core import event

from app import remediation  # noqa: F401  registers the custom steps


async def _stream_events_to_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8", buffering=1) as f:
        async for e in event.subscribe(populate_with_buffered=False):
            rec = None
            if isinstance(e, event.PipelineStepBeginEvent):
                step_name = getattr(e, "step_name", None) or type(getattr(e, "step", None)).__name__
                rec = {
                    "type": "step_begin",
                    "step_name": step_name,
                    "message": f"Starting {step_name}",
                }
            elif isinstance(e, event.PipelineStepProgressEvent):
                step_name = getattr(e, "step_name", None) or type(getattr(e, "step", None)).__name__
                rec = {
                    "type": "step_progress",
                    "step_name": step_name,
                    "completed": int(e.completed),
                    "total": int(e.total),
                    "message": e.message or f"{int(e.completed)}/{int(e.total)}",
                }
            elif isinstance(e, event.PipelineStepEndEvent):
                step_name = getattr(e, "step_name", None) or type(getattr(e, "step", None)).__name__
                status = "success"
                if hasattr(e, "step_result") and hasattr(e.step_result, "status"):
                    status = e.step_result.status.value
                rec = {
                    "type": "step_end",
                    "step_name": step_name,
                    "status": status,
                }
            if rec:
                rec["timestamp"] = datetime.now(UTC).isoformat()
                f.write(json.dumps(rec) + "\n")
                f.flush()


async def _run_with_optional_progress(progress_path: Path | None) -> int:
    task = None
    if progress_path:
        task = asyncio.create_task(_stream_events_to_file(progress_path))
    try:
        return await _main()
    finally:
        if task:
            task.cancel()


def main() -> None:
    progress_path: Path | None = None
    args = sys.argv[1:]
    new_args = []
    i = 0
    while i < len(args):
        if args[i] in ("--progress-file", "--events-jsonl") and i + 1 < len(args):
            progress_path = Path(args[i + 1])
            i += 2
        else:
            new_args.append(args[i])
            i += 1
    sys.argv = [sys.argv[0], *new_args]

    try:
        exit_code = asyncio.run(_run_with_optional_progress(progress_path))
    except SystemExit as exc:
        exit_code = exc.code if isinstance(exc.code, int) else 0

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
