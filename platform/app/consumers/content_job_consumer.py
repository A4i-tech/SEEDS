"""
Content job consumer.

Polls MongoDB for pending content processing jobs and processes them:
  - Audio: FFmpeg transcode to WAV (subprocess, no shell=True)
  - TTS: Generate title + theme audio via tts_service
  - Blob: Upload processed audio to Azure Blob Storage
  - Retry: Transient errors (network, timeout) are retried up to 3× with
           exponential backoff (1 s → 2 s → 4 s) before dead-lettering.
  - Dead-letter: Permanent errors (corrupt file, missing blob, parse failure)
                 → job status=failed, reason=str(e), failed_at=<utcnow>

Ported from backend-server/src/jobs/processAudioContent.js and processQuizContent.js.

SECURITY:
  - subprocess always called with list form — never shell=True.
  - All temp file paths validated to be within the system temp directory.
  - No user-supplied strings are ever passed to the shell.

=============================================================================
RUNBOOK — Content Job Lifecycle
=============================================================================

State machine:
    pending  →  claimed  →  running  →  completed
                                     ↘  failed  (dead-letter)

Stages:
  1. CLAIM    The consumer atomically moves a job from pending → claimed via
              find_one_and_update.  Only one consumer instance will claim a
              given job, preventing duplicate processing.

  2. RUN      The job is processed by _process_audio_content_job():
                a. status set to "running"
                b. Content document fetched from contentsV3
                c. Each audioContent item downloaded, transcoded (FFmpeg),
                   and re-uploaded as .wav.
                d. If isPullModel: TTS generated for title + theme.
                e. contentsV3 updated with new URLs and isProcessed=True.
                f. Job status set to "completed".

  3. RETRY    On transient errors (ConnectionError, TimeoutError, OSError) the
              job is retried up to MAX_RETRIES (3) times with exponential
              backoff starting at RETRY_BASE_SECONDS (1 s).  The job remains
              in "running" state during retries.

  4. DEAD-LETTER  After all retries exhausted, OR on a permanent error
              (ValueError, RuntimeError — e.g. corrupt file, missing content):
                - status set to "failed"
                - reason set to str(exception)
                - failed_at set to utcnow

  5. TIMEOUT  If processing exceeds JOB_TIMEOUT_SECONDS (5 min) the job is
              dead-lettered with reason "Job exceeded timeout of 5 minutes".

Monitoring:
  - All transitions are logged at INFO level (job_id, content_id, attempt).
  - Retry attempts logged at WARNING level.
  - Dead-lettering logged at ERROR level with full traceback.

Recovery:
  - To replay a failed job: update status="pending" in content_jobs collection.
  - To skip a job permanently: update status="skipped" (not processed by consumer).
=============================================================================
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess  # nosec B404 — used safely with list form, no shell=True
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Maximum processing time per job
JOB_TIMEOUT_SECONDS = 5 * 60  # 5 minutes
POLL_INTERVAL_SECONDS = 10
FFMPEG_TIMEOUT_SECONDS = 5 * 60  # 5 minutes

# Retry configuration (transient errors only)
MAX_RETRIES = 3
RETRY_BASE_SECONDS = 1.0  # backoff: 1 s, 2 s, 4 s

# Errors that indicate a transient condition and should be retried
_TRANSIENT_ERRORS = (ConnectionError, TimeoutError, OSError)

_CONTENT_COLLECTION = "contentsV3"
_JOB_COLLECTION = "content_jobs"


# ---------------------------------------------------------------------------
# Path validation helper
# ---------------------------------------------------------------------------

def _validate_temp_path(path: str) -> None:
    """Assert that *path* is inside the system temp directory.

    Raises ValueError if the path escapes the temp directory.
    This prevents path-traversal attacks on temp file usage.
    """
    temp_dir = Path(tempfile.gettempdir()).resolve()
    resolved = Path(path).resolve()
    try:
        resolved.relative_to(temp_dir)
    except ValueError as exc:
        raise ValueError(
            f"Security violation: path {path!r} is not within temp directory {temp_dir}"
        ) from exc


# ---------------------------------------------------------------------------
# FFmpeg helper
# ---------------------------------------------------------------------------

async def _transcode_to_wav(input_path: str, output_path: str) -> None:
    """Transcode audio at *input_path* to 16 kHz mono WAV at *output_path*.

    SECURITY:
      - Uses subprocess list form — no shell=True.
      - Both paths are validated to be inside the system temp directory.
      - Timeout enforced to prevent runaway processes.

    Raises subprocess.CalledProcessError on non-zero exit or TimeoutExpired.
    """
    _validate_temp_path(input_path)
    _validate_temp_path(output_path)

    cmd = [
        "ffmpeg",
        "-y",           # overwrite output without prompting
        "-i", input_path,
        "-ar", "8000",  # sample rate — matches JS: -ar 8000
        "-ac", "1",     # mono
        "-sample_fmt", "s16",
        output_path,
    ]

    logger.info("ffmpeg: transcoding %s -> %s", input_path, output_path)

    # Run in executor to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: subprocess.run(  # nosec B603 — list form, no shell=True
            cmd,
            check=True,
            capture_output=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
        ),
    )
    logger.info("ffmpeg: completed %s", output_path)


# ---------------------------------------------------------------------------
# Temp file helpers
# ---------------------------------------------------------------------------

def _make_temp_input_path(content_id: str, suffix: str = ".mp3") -> str:
    """Create a safe temp path for an input audio file."""
    fd, path = tempfile.mkstemp(
        prefix=f"seeds_input_{content_id}_",
        suffix=suffix,
    )
    os.close(fd)
    _validate_temp_path(path)
    return path


def _make_temp_output_path(content_id: str) -> str:
    """Create a safe temp path for a transcoded WAV file."""
    fd, path = tempfile.mkstemp(
        prefix=f"seeds_output_{content_id}_",
        suffix=".wav",
    )
    os.close(fd)
    _validate_temp_path(path)
    return path


def _cleanup_temp_files(*paths: str) -> None:
    """Remove temp files, logging but not re-raising errors."""
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.unlink(p)
        except OSError as exc:
            logger.warning("cleanup: failed to remove %s — %s", p, exc)


# ---------------------------------------------------------------------------
# Audio processing
# ---------------------------------------------------------------------------

def _parse_blob_url_simple(blob_url: str) -> tuple[str, str]:
    """Parse an Azure Blob URL into (container, blob_path) without importing blob_storage."""
    from urllib.parse import urlparse as _up  # noqa: PLC0415

    parsed = _up(blob_url)
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Invalid blob URL format: {blob_url!r}")
    return parts[0], "/".join(parts[1:])


async def _process_audio_item(
    audio_url: str,
    content_id: str,
    blob_provider,
) -> tuple[str, float | None]:
    """Download *audio_url*, transcode to WAV, upload, return (new_url, duration).

    Raises on any failure; caller handles dead-lettering.
    """

    input_path = _make_temp_input_path(content_id)
    output_path = _make_temp_output_path(content_id)

    try:
        # Download input
        logger.info("content_job: downloading audio %s", audio_url)
        audio_bytes = await blob_provider.download_from_url(audio_url)
        if not audio_bytes:
            raise RuntimeError(f"Downloaded empty buffer from {audio_url}")

        with open(input_path, "wb") as fh:
            fh.write(audio_bytes)

        # Transcode
        await _transcode_to_wav(input_path, output_path)

        # Read transcoded data
        with open(output_path, "rb") as fh:
            transcoded = fh.read()

        # Extract duration (best-effort)
        duration: float | None = None
        try:
            duration = await _extract_duration(output_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("content_job: duration extraction failed — %s", exc)

        # Upload to output-container as .wav
        container, blob_path = _parse_blob_url_simple(audio_url)
        wav_blob_name = blob_path.rsplit(".", 1)[0] + ".wav" if "." in blob_path else blob_path + ".wav"
        new_url = await blob_provider.upload_file("output-container", wav_blob_name, transcoded, "audio/wav")

        return new_url, duration

    finally:
        _cleanup_temp_files(input_path, output_path)


async def _extract_duration(wav_path: str) -> float | None:
    """Extract duration in seconds from a WAV file using ffprobe."""
    _validate_temp_path(wav_path)

    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        wav_path,
    ]

    loop = asyncio.get_event_loop()

    def _run() -> str:
        result = subprocess.run(  # nosec B603 — list form, no shell=True
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout.strip()

    output = await loop.run_in_executor(None, _run)
    try:
        return float(output)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# TTS processing helpers
# ---------------------------------------------------------------------------

async def _process_tts_for_content(content_doc: dict, blob_provider) -> None:
    """Generate and upload TTS audio for title and theme of *content_doc*.

    Mutates *content_doc* in-place with updated audioUrl fields.
    """
    from app.services import tts_service  # noqa: PLC0415

    language = content_doc.get("language", "")
    content_id = str(content_doc.get("_id", ""))

    # Title TTS
    title = content_doc.get("title", {})
    title_text = (title.get("local") or "").strip()
    if title_text:
        tts_text = tts_service.add_for_in_option_audio(language, title_text)
        logger.info("content_job: synthesising title TTS content_id=%s", content_id)
        audio_bytes = await tts_service.synthesize(tts_text, language)
        url = await blob_provider.upload_file(
            "experience-titles", f"{content_id}/1.0.mp3", audio_bytes, "audio/mpeg"
        )
        content_doc["title"] = {**title, "audioUrl": url}

    # Theme TTS
    theme = content_doc.get("theme", {})
    theme_english = (theme.get("english") or "").strip()
    theme_local = (theme.get("local") or "").strip()

    if theme_english:
        theme_blob_name = f"{theme_english}/1.0.mp3"
        # Check if theme audio already exists
        try:
            container_client = blob_provider.get_container_client("theme-titles")
            blob_client = container_client.get_blob_client(theme_blob_name)
            blob_client.get_blob_properties()
            # Exists — reuse
            content_doc["theme"] = {**theme, "audioUrl": blob_client.url}
            logger.info("content_job: reusing existing theme audio theme=%s", theme_english)
        except Exception:  # noqa: BLE001
            # Does not exist — generate
            if theme_local:
                tts_text = tts_service.add_for_in_option_audio(language, theme_local)
                audio_bytes = await tts_service.synthesize(tts_text, language)
                url = await blob_provider.upload_file(
                    "theme-titles", theme_blob_name, audio_bytes, "audio/mpeg"
                )
                content_doc["theme"] = {**theme, "audioUrl": url}


# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------

async def _process_audio_content_job(job_doc: dict, db: AsyncIOMotorDatabase, blob_provider) -> None:
    """Process a single audio content job with retry and dead-letter handling.

    Retry policy:
      - Transient errors (ConnectionError, TimeoutError, OSError) → retry up
        to MAX_RETRIES times with exponential backoff (RETRY_BASE_SECONDS × 2^n).
      - Permanent errors (ValueError, RuntimeError, all others after max
        retries exhausted) → dead-letter: status=failed, reason=str(e).

    Mutates job status in DB on completion or failure.
    """
    from datetime import datetime  # noqa: PLC0415

    job_id = job_doc.get("_id")
    content_id = job_doc.get("content_id")
    jobs_col = db[_JOB_COLLECTION]
    content_col = db[_CONTENT_COLLECTION]

    # Mark as running
    await jobs_col.update_one(
        {"_id": job_id},
        {"$set": {"status": "running", "started_at": datetime.now(UTC)}},
    )

    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            content_doc = await content_col.find_one({"_id": content_id})
            if not content_doc:
                raise RuntimeError(f"Content document not found: {content_id}")

            # Process each audio item
            audio_content = content_doc.get("audioContent", [])
            updated_audio = []
            for item in audio_content:
                audio_url = item.get("audioUrl", "")
                if not audio_url:
                    updated_audio.append(item)
                    continue
                # Skip non-mp3 files
                if not audio_url.lower().endswith(".mp3"):
                    logger.warning("content_job: skipping non-mp3 url=%s", audio_url)
                    updated_audio.append(item)
                    continue

                new_url, duration = await _process_audio_item(audio_url, str(content_id), blob_provider)
                updated_item = {**item, "audioUrl": new_url}
                if duration is not None:
                    updated_item["durationSeconds"] = duration
                updated_audio.append(updated_item)

            content_doc["audioContent"] = updated_audio

            # TTS for pull-model content
            if content_doc.get("isPullModel"):
                await _process_tts_for_content(content_doc, blob_provider)

            # Save updated content
            update_fields = {
                "audioContent": content_doc["audioContent"],
                "isProcessed": True,
            }
            if "title" in content_doc:
                update_fields["title"] = content_doc["title"]
            if "theme" in content_doc:
                update_fields["theme"] = content_doc["theme"]

            await content_col.update_one({"_id": content_id}, {"$set": update_fields})

            # Mark job complete
            await jobs_col.update_one(
                {"_id": job_id},
                {"$set": {"status": "completed", "completed_at": datetime.now(UTC)}},
            )
            logger.info(
                "content_job: completed job_id=%s content_id=%s (attempt %d)",
                job_id, content_id, attempt,
            )
            return  # success — exit retry loop

        except _TRANSIENT_ERRORS as exc:
            last_exc = exc
            if attempt < MAX_RETRIES:
                backoff = RETRY_BASE_SECONDS * (2 ** (attempt - 1))
                logger.warning(
                    "content_job: transient error job_id=%s attempt=%d/%d, retrying in %.1fs — %s: %s",
                    job_id, attempt, MAX_RETRIES, backoff, type(exc).__name__, exc,
                )
                await asyncio.sleep(backoff)
            else:
                logger.error(
                    "content_job: max retries exhausted job_id=%s content_id=%s — %s",
                    job_id, content_id, exc,
                )
                break

        except Exception as exc:  # noqa: BLE001 — permanent error, dead-letter immediately
            last_exc = exc
            logger.exception(
                "content_job: permanent error job_id=%s content_id=%s — %s",
                job_id, content_id, exc,
            )
            break  # skip retries for permanent errors

    # Dead-letter: mark as failed with reason
    error_msg = str(last_exc) if last_exc else "Unknown error"
    logger.error(
        "content_job: dead-lettering job_id=%s content_id=%s reason=%r",
        job_id, content_id, error_msg,
    )
    await jobs_col.update_one(
        {"_id": job_id},
        {
            "$set": {
                "status": "failed",
                "reason": error_msg,
                "failed_at": datetime.now(UTC),
            }
        },
    )
    if last_exc is not None:
        raise last_exc


# ---------------------------------------------------------------------------
# Consumer class
# ---------------------------------------------------------------------------

class ContentJobConsumer:
    """Polls the content_jobs collection for pending jobs and processes them.

    To be started as an asyncio background task from the lifespan.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db
        self._running = False

    async def run(self) -> None:
        """Start the polling loop (alias for lifespan compatibility)."""
        await self.start()

    async def start(self) -> None:
        """Start the polling loop."""
        self._running = True
        logger.info("ContentJobConsumer: started")
        try:
            await self._run_loop()
        except asyncio.CancelledError:
            logger.info("ContentJobConsumer: cancelled")
        finally:
            self._running = False

    async def stop(self) -> None:
        """Signal the loop to stop."""
        self._running = False

    async def _run_loop(self) -> None:
        """Poll for pending jobs and process them."""
        blob_provider = None
        jobs_col = self._db[_JOB_COLLECTION]

        while self._running:
            # Re-attempt init each cycle so we recover when blob storage comes back
            if blob_provider is None:
                try:
                    from app.providers.blob_storage import BlobStorageProvider  # noqa: PLC0415
                    blob_provider = BlobStorageProvider()
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "ContentJobConsumer: BlobStorageProvider unavailable — %s. "
                        "No jobs will be claimed until storage recovers. Retrying in %ds.",
                        exc, POLL_INTERVAL_SECONDS,
                    )
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue

            try:
                # Find one pending job atomically
                job_doc = await jobs_col.find_one_and_update(
                    {"status": "pending"},
                    {"$set": {"status": "claimed", "claimed_at": datetime.now(UTC)}},
                    return_document=True,
                )

                if job_doc:
                    try:
                        await asyncio.wait_for(
                            _process_audio_content_job(job_doc, self._db, blob_provider),
                            timeout=JOB_TIMEOUT_SECONDS,
                        )
                    except TimeoutError:
                        job_id = job_doc.get("_id")
                        logger.error("content_job: timeout job_id=%s", job_id)
                        await jobs_col.update_one(
                            {"_id": job_id},
                            {
                                "$set": {
                                    "status": "failed",
                                    "reason": "Job exceeded timeout of 5 minutes",
                                    "failed_at": datetime.now(UTC),
                                }
                            },
                        )
                    except Exception as exc:  # noqa: BLE001
                        # Already dead-lettered inside _process_audio_content_job
                        logger.debug("content_job: job processing exception handled: %s", exc)
                else:
                    # No pending jobs — wait before polling again
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)

            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("ContentJobConsumer: unexpected error in loop — %s", exc)
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
