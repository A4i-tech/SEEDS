from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

PLATFORM_ROOT = Path(__file__).resolve().parent.parent.parent

# The only platform secrets the remediation/translation pipelines actually
# read (OCR + chat-completion model credentials) — not the platform's whole
# .env, which also carries DB connection strings and unrelated service keys.
_REMEDIATION_SETTINGS_KEYS = (
    "openai_api_key",
    "groq_api_key",
    "mistral_ocr_api_key",
    "mistral_ocr_endpoint",
    "mistral_ocr_model",
)


async def run_pipeline(
    pipeline_path: Path,
    resource: Path,
    workspace: Path,
    options: list[str],
    on_progress: Callable[[dict[str, object]], Awaitable[None]] | None = None,
    timeout: float | None = None,
) -> None:
    progress_file = workspace / "remediation.progress.jsonl"
    command = [
        sys.executable, "-m", "app.remediation.run",
        str(pipeline_path), "--input", str(resource),
        "--quiet", "--progress-file", str(progress_file), *options,
    ]
    settings = get_settings()
    env_vars = {name.upper(): value for name in _REMEDIATION_SETTINGS_KEYS if (value := getattr(settings, name))}

    env = {
        **os.environ,
        **env_vars,
        "PYTHONPATH": str(PLATFORM_ROOT),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
    }

    stop_tailing = asyncio.Event()

    async def _tail_progress() -> None:
        file_pos = 0
        while not stop_tailing.is_set():
            if progress_file.exists():
                try:
                    with open(progress_file, encoding="utf-8") as f:
                        f.seek(file_pos)
                        lines = f.readlines()
                        file_pos = f.tell()
                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            evt = json.loads(line)
                            if on_progress:
                                await on_progress(evt)
                        except Exception as exc:
                            logger.warning("remediation: failed parsing progress line: %s", exc)
                except Exception as exc:
                    logger.warning("remediation: failed reading progress file: %s", exc)
            await asyncio.sleep(0.5)

    tail_task = asyncio.create_task(_tail_progress())
    try:
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(workspace),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout)
        except TimeoutError as exc:
            proc.kill()
            _, stderr = await proc.communicate()
            raise RuntimeError(
                f"Pipeline {pipeline_path.name} timed out after {timeout}s: "
                f"{stderr.decode('utf-8', 'replace').strip()[-2000:]}"
            ) from exc
        except asyncio.CancelledError:
            proc.kill()
            await proc.communicate()
            raise
    finally:
        stop_tailing.set()
        await asyncio.sleep(0.1)
        tail_task.cancel()

    if proc.returncode != 0:
        err_msg = stderr.decode("utf-8", "replace").strip() or stdout.decode("utf-8", "replace").strip()
        raise RuntimeError(f"Pipeline {pipeline_path.name} failed: {err_msg[-2000:]}")
