"""Runs one OmniIngest pipeline YAML as a subprocess against a resource file.

Shared by the remediation consumer (textbook_remediation.yaml) and the
translation runner (textbook_translation.yaml) — same subprocess/progress
plumbing, different pipeline file and CLI params.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import subprocess
from collections.abc import Awaitable, Callable
from pathlib import Path

import dotenv

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

PLATFORM_ROOT = Path(__file__).resolve().parent.parent.parent


async def run_pipeline(
    pipeline_path: Path,
    resource: Path,
    workspace: Path,
    options: list[str],
    on_progress: Callable[[dict[str, object]], Awaitable[None]] | None = None,
) -> None:
    progress_file = workspace / "remediation.progress.jsonl"
    command = [
        get_settings().remediation_python, "-m", "app.remediation.run",
        str(pipeline_path), "--input", str(resource),
        "--quiet", "--progress-file", str(progress_file), *options,
    ]
    env_file = PLATFORM_ROOT / ".env"
    env_vars: dict[str, str] = {}
    if env_file.exists():
        env_vars = {k: v for k, v in dotenv.dotenv_values(env_file).items() if v is not None}
        with contextlib.suppress(Exception):
            (workspace / ".env").write_bytes(env_file.read_bytes())

    env = {
        **os.environ,
        **env_vars,
        "PYTHONPATH": str(PLATFORM_ROOT),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
    }

    def _exec() -> tuple[int, str]:
        proc = subprocess.Popen(
            command, cwd=str(workspace), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        stdout, stderr = proc.communicate()
        err_msg = stderr.decode("utf-8", "replace").strip() or stdout.decode("utf-8", "replace").strip()
        return proc.returncode, err_msg

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
        returncode, err_msg = await asyncio.to_thread(_exec)
    finally:
        stop_tailing.set()
        await asyncio.sleep(0.1)
        tail_task.cancel()

    if returncode != 0:
        raise RuntimeError(f"Pipeline {pipeline_path.name} failed: {err_msg[-2000:]}")
