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


def _stderr_tail(path: Path) -> str:
    with open(path, "rb") as f:
        f.seek(max(path.stat().st_size - 8000, 0))
        return f.read().decode("utf-8", "replace").strip()[-2000:]


def _failure_message(name: str, code: int, step: str | None, tail: str) -> str:
    step_desc = step or "an unknown step"
    if code < 0:
        msg = (
            f"The remediation pipeline was stopped by signal {-code} during step {step_desc}, "
            "most likely because it ran out of memory. Retry with a smaller PDF, or ask an "
            "admin to raise the worker memory limit."
        )
    else:
        msg = (
            f"Pipeline {name} failed during step {step_desc} with exit code {code}. "
            "Check the stderr output below for the cause."
        )
    if tail:
        msg += f" stderr: {tail}"
    return msg


async def run_pipeline(
    pipeline_path: Path,
    resource: Path,
    workspace: Path,
    options: list[str],
    on_progress: Callable[[dict[str, object]], Awaitable[None]] | None = None,
    timeout: float | None = None,
) -> None:
    progress_file = workspace / "remediation.progress.jsonl"
    stderr_path = workspace / "remediation.stderr.log"
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
    last_step: dict[str, str | None] = {"name": None}

    async def _tail_progress() -> None:
        file_pos = 0

        async def _read_new() -> None:
            nonlocal file_pos
            if not progress_file.exists():
                return
            try:
                with open(progress_file, encoding="utf-8") as f:
                    f.seek(file_pos)
                    lines = f.readlines()
                    file_pos = f.tell()
            except Exception as exc:
                logger.warning("remediation: failed reading progress file: %s", exc)
                return
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    evt = json.loads(line)
                except Exception as exc:
                    logger.warning("remediation: failed parsing progress line: %s", exc)
                    continue
                if evt.get("step_name"):
                    last_step["name"] = evt["step_name"]
                if on_progress:
                    try:
                        await on_progress(evt)
                    except Exception as exc:
                        logger.warning("remediation: failed handling progress event: %s", exc)

        while not stop_tailing.is_set():
            await _read_new()
            await asyncio.sleep(0.5)
        await _read_new()

    tail_task = asyncio.create_task(_tail_progress())
    try:
        with open(stderr_path, "wb") as stderr_fh:
            proc = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(workspace),
                env=env,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=stderr_fh,
            )
        try:
            await asyncio.wait_for(proc.wait(), timeout)
        except TimeoutError as exc:
            proc.kill()
            await proc.wait()
            tail = _stderr_tail(stderr_path)
            logger.error(
                "remediation: pipeline %s timed out after %ss, last step=%s: %s",
                pipeline_path.name, timeout, last_step["name"], tail,
            )
            raise RuntimeError(
                f"Pipeline {pipeline_path.name} timed out after {timeout}s during step "
                f"{last_step['name'] or 'an unknown step'}: {tail}"
            ) from exc
        except asyncio.CancelledError:
            proc.kill()
            await proc.wait()
            raise
    finally:
        stop_tailing.set()
        await tail_task

    if proc.returncode != 0:
        tail = _stderr_tail(stderr_path)
        logger.error(
            "remediation: pipeline %s failed rc=%s last step=%s: %s",
            pipeline_path.name, proc.returncode, last_step["name"], tail,
        )
        raise RuntimeError(_failure_message(pipeline_path.name, proc.returncode, last_step["name"], tail))
