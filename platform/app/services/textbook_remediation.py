from __future__ import annotations

import asyncio
import json
import logging
import re
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

from azure.core.exceptions import ResourceNotFoundError
from bson import ObjectId
from fastapi import Depends, UploadFile
from fastapi.responses import StreamingResponse
from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import (
    ARTIFACTS,
    IMAGE_CONTENT_TYPES,
    STAGES,
    ArtifactName,
    JobStatus,
    RemediationJob,
    artifact_filename,
)
from app.models.requests.textbook_requests import CreateJobRequest
from app.models.responses.remediation import (
    CreateRemediationJobResponse,
    DiagramResponse,
    FindingsPageResponse,
    FlaggedItemResponse,
    RemediationJobResponse,
    ReviewSummaryResponse,
)
from app.models.user import UserRole
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError, ConflictError, NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.remediation.accuracy import score_edit
from app.remediation.edit_diff import edit_diff_pairs
from app.remediation.render import compile_docx_tex_pdf
from app.remediation.translate import run_translation
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.repositories.user_repository import UserRepository
from app.services.textbook_upload_validation import validate_language, validate_pdf_upload

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
_TERMINAL: tuple[JobStatus, ...] = (
    JobStatus.READY_TO_REVIEW,
    JobStatus.VERIFIED,
    JobStatus.FAILED,
)
_IMAGE_REF = re.compile(r'\]\(images/([^)\s"]+)')


class TextbookRemediationService:
    def __init__(self, db: AsyncDatabase, blob_provider: BlobStorageProvider) -> None:
        self._repo = TextbookRemediationRepository(db)
        self._users = UserRepository(db)
        self._blob = blob_provider

    @staticmethod
    def serialize_job(job: RemediationJob) -> RemediationJobResponse:
        return RemediationJobResponse(
            job_id=job.job_id,
            source_name=job.source_name,
            language=job.language,
            detected_language=job.detected_language,
            status=job.status,
            stage=job.stage,
            stage_index=STAGES.index(job.stage) + 1 if job.stage in STAGES else 0,
            stage_count=len(STAGES),
            artifacts=job.artifacts,
            counts=job.counts,
            metrics=job.metrics,
            models=job.models,
            progress=job.progress,
            draft_remediated_md=job.draft_remediated_md,
            verified_at=job.verified_at,
            verified_by=job.verified_by,
            title=job.title,
            error=job.error,
            created_at=job.created_at,
            assigned_to=job.assigned_to,
            finished_at=job.finished_at,
            target_language=job.target_language,
            translation_error=job.translation_error,
            source_page_count=job.source_page_count,
            book_id=job.book_id,
            edit_accuracy=job.edit_accuracy,
        )

    @staticmethod
    def compile_verified(markdown: str, out_dir: Path) -> tuple[Path, Path, Path | None]:
        out_docx = out_dir / artifact_filename(ArtifactName.DOCX)
        out_tex = out_dir / artifact_filename(ArtifactName.TEX)
        out_pdf = compile_docx_tex_pdf(markdown, out_dir, out_docx, out_tex, resource_root=out_dir)
        return out_docx, out_tex, out_pdf

    @staticmethod
    def _resolve_artifact(job: RemediationJob, name: str) -> tuple[ArtifactName, str]:
        try:
            artifact = ArtifactName(name)
        except ValueError as exc:
            expected = sorted(a.value for a in ArtifactName)
            raise ValidationError(f"Unknown artifact {name!r}; expected one of {expected}") from exc

        url = job.source_url if artifact == ArtifactName.SOURCE else job.artifacts.get(artifact)
        if url is None:
            raise NotFoundError("Artifact", f"{job.job_id}/{name}")

        return artifact, url

    @staticmethod
    async def _iter_jsonl_lines(chunks: AsyncIterator[bytes]) -> AsyncIterator[str]:
        buffer = b""

        async for chunk in chunks:
            *lines, buffer = (buffer + chunk).split(b"\n")

            for line in lines:
                if line.strip():
                    yield line.decode("utf-8")

        if buffer.strip():
            yield buffer.decode("utf-8")

    async def _iter_artifact_jsonl(self, job: RemediationJob, name: str) -> AsyncIterator[dict[str, object]]:
        _artifact, url = self._resolve_artifact(job, name)
        chunks = await self._blob.download_chunks_from_url(url)

        async for line in self._iter_jsonl_lines(chunks):
            yield json.loads(line)

    async def _stream_blob(
        self, blob_path: str, media_type: str, not_found_kind: str, not_found_id: str
    ) -> StreamingResponse:
        container = get_settings().azure_storage_container
        try:
            size = await self._blob.blob_size(container, blob_path)
            chunks = await self._blob.download_chunks(container, blob_path)
        except ResourceNotFoundError as exc:
            raise NotFoundError(not_found_kind, not_found_id) from exc

        return StreamingResponse(
            chunks,
            media_type=media_type,
            headers={
                "Cache-Control": "private, max-age=86400",
                "X-Content-Type-Options": "nosniff",
                "Content-Length": str(size),
            },
        )

    async def subscribe(
        self, tenant_id: str, job_id: str, *, interval: float = POLL_INTERVAL_SECONDS
    ) -> AsyncIterator[dict[str, object]]:
        previous: dict[str, object] | None = None

        while True:
            job = await self._repo.get(tenant_id, job_id, include_draft=False)

            if job is None:
                return

            payload = self.serialize_job(job).model_dump(mode="json")

            if job.status in _TERMINAL:
                yield {"event": "done", "job": payload}
                return

            if payload != previous:
                yield {"event": "progress", "job": payload}
                previous = payload

            await asyncio.sleep(interval if interval > 0 else 0)

    async def require_job(self, user: dict[str, object], job_id: str) -> RemediationJob:
        job = await self._repo.get(str(user["tenant_id"]), job_id)
        is_volunteer = user.get("role") == UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER.value

        if job is None or (is_volunteer and job.assigned_to != user["sub"]):
            raise NotFoundError("Remediation job", job_id)

        return job

    async def create_job(
        self,
        *,
        tenant_id: str,
        file: UploadFile,
        language: str,
        target_language: str | None,
        book_id: str | None = None,
    ) -> RemediationJob:
        await validate_pdf_upload(file)

        if language != "auto":
            validate_language(language)

        if target_language:
            validate_language(target_language)

        job_id = ObjectId()
        url = await self._blob.upload_file(
            get_settings().azure_storage_container, f"textbook-remediation/{job_id}/source.pdf", file.file, "application/pdf"
        )

        return await self._repo.create(
            job_id=job_id,
            tenant_id=tenant_id,
            source_name=file.filename if file.filename else "textbook.pdf",
            source_url=url,
            language=language,
            target_language=target_language,
            book_id=book_id,
        )

    async def create(self, tenant_id: str, file: UploadFile, payload: CreateJobRequest) -> CreateRemediationJobResponse:
        job = await self.create_job(
            tenant_id=tenant_id, file=file,
            language=payload.language,
            target_language=payload.target_language if payload.target_language != "" else None,
        )
        return CreateRemediationJobResponse(job_id=job.job_id)

    async def remove(self, tenant_id: str, job_id: str) -> None:
        deleted = await self._repo.soft_delete(tenant_id, job_id)

        if deleted is None:
            raise NotFoundError("Remediation job", job_id)

    async def get(self, user: dict[str, object], job_id: str) -> RemediationJobResponse:
        return self.serialize_job(await self.require_job(user, job_id))

    async def assign_job(
        self, tenant_id: str, job_id: str, volunteer_id: str, force: bool = False
    ) -> RemediationJob:
        volunteer = await self._users.find_active_by_tenant_and_role(
            tenant_id, volunteer_id, UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER.value
        )
        if volunteer is None:
            raise ValidationError(
                "volunteer_id must be an active textbook remediation volunteer in this tenant"
            )

        current = await self._repo.get(tenant_id, job_id)
        if current is None:
            raise NotFoundError("Remediation job", job_id)

        if current.assigned_to and current.assigned_to != volunteer_id and not force:
            raise ConflictError(f"job {job_id} is already assigned; pass force to reassign")

        updated = await self._repo.set_assignment(tenant_id, job_id, volunteer_id)
        if updated is None:
            raise NotFoundError("Remediation job", job_id)

        if force and current.assigned_to and current.assigned_to != volunteer_id:
            logger.warning(
                "remediation job reassigned",
                extra={"job_id": job_id, "from": current.assigned_to, "to": volunteer_id},
            )

        return updated

    async def assign(
        self, tenant_id: str, job_id: str, volunteer_id: str, force: bool
    ) -> RemediationJobResponse:
        return self.serialize_job(await self.assign_job(tenant_id, job_id, volunteer_id, force))

    async def artifact_bytes(self, job: RemediationJob, name: str) -> tuple[bytes, str]:
        artifact, url = self._resolve_artifact(job, name)
        return await self._blob.download_from_url(url), ARTIFACTS[artifact][1]

    async def artifact(self, user: dict[str, object], job_id: str, name: str) -> StreamingResponse:
        job = await self.require_job(user, job_id)
        artifact, url = self._resolve_artifact(job, name)

        return StreamingResponse(
            await self._blob.download_chunks_from_url(url),
            media_type=ARTIFACTS[artifact][1],
            headers={"Content-Disposition": f'attachment; filename="{ARTIFACTS[ArtifactName(name)][0]}"'},
        )

    async def findings_page(self, job: RemediationJob, name: str, *, limit: int, offset: int) -> FindingsPageResponse:
        page: list[dict[str, object]] = []
        total = 0

        async for item in self._iter_artifact_jsonl(job, name):
            if offset <= total < offset + limit:
                page.append(item)

            total += 1

        return FindingsPageResponse(findings=page, total=total, offset=offset, has_more=offset + limit < total)

    async def findings(
        self, user: dict[str, object], job_id: str, name: str, limit: int, offset: int
    ) -> FindingsPageResponse:
        job = await self.require_job(user, job_id)
        return await self.findings_page(job, name, limit=limit, offset=offset)

    async def save(self, user: dict[str, object], job_id: str, draft_md: str) -> RemediationJobResponse:
        job = await self.require_job(user, job_id)
        url = await self._blob.upload_file(
            get_settings().azure_storage_container,
            f"textbook-remediation/{job.job_id}/{artifact_filename(ArtifactName.DRAFT)}",
            draft_md.encode("utf-8"),
            "text/markdown",
        )

        updated = await self._repo.update_draft(job.job_id, draft_md, url)

        if updated is None:
            raise NotFoundError("Remediation job", job.job_id)

        return self.serialize_job(updated)

    async def fetch_images(self, job: RemediationJob, markdown: str, out_dir: Path) -> str:
        container = get_settings().azure_storage_container
        target = out_dir / "images" / job.job_id
        target.mkdir(parents=True)

        for name in {Path(n).name for n in _IMAGE_REF.findall(markdown)}:
            try:
                data = await self._blob.download_file(container, f"textbook-remediation/{job.job_id}/images/{name}")
            except ResourceNotFoundError:
                logger.warning("Figure %s of job %s is missing; the document shows its description", name, job.job_id)
                continue

            (target / name).write_bytes(data)

        # One folder per job, so figures of two chapters can never share a file name.
        return _IMAGE_REF.sub(lambda m: f"](images/{job.job_id}/{Path(m.group(1)).name}", markdown)

    async def verify_job(
        self, job: RemediationJob, *, title: str, verified_by: str, edited_by: str
    ) -> RemediationJob:
        previous_md = ""

        if ArtifactName.REMEDIATED in job.artifacts:
            remediated_bytes, _ = await self.artifact_bytes(job, ArtifactName.REMEDIATED)
            previous_md = remediated_bytes.decode("utf-8")

        final_md = previous_md if job.draft_remediated_md is None else job.draft_remediated_md
        accuracy = await asyncio.to_thread(score_edit, previous_md, final_md)

        if job.draft_remediated_md is not None:
            with tempfile.TemporaryDirectory() as tmpdir:
                out_dir = Path(tmpdir)
                try:
                    markdown = await self.fetch_images(job, job.draft_remediated_md, out_dir)
                    out_docx, out_tex, out_pdf = await asyncio.to_thread(self.compile_verified, markdown, out_dir)
                except Exception as exc:
                    logger.error("Could not compile verified artifacts for job %s: %s", job.job_id, exc)
                    raise ValidationError(f"Could not build the verified document: {exc}") from exc

                container = get_settings().azure_storage_container
                verified: dict[str, str] = {}

                for name, out_path in (
                    (ArtifactName.DOCX, out_docx),
                    (ArtifactName.TEX, out_tex),
                    (ArtifactName.PDF, out_pdf),
                ):
                    if out_path and out_path.exists():
                        with out_path.open("rb") as fh:
                            verified[name] = await self._blob.upload_file(
                                container,
                                f"textbook-remediation/{job.job_id}/verified/{ARTIFACTS[name][0]}",
                                fh,
                                ARTIFACTS[name][1],
                            )

                if verified:
                    await self._repo.record_artifacts(job.job_id, verified, {})

        updated = await self._repo.mark_verified(
            job.job_id,
            verified_by=verified_by,
            title=title if title != "" else job.source_name.replace(".pdf", " (Accessible)"),
            accuracy=accuracy,
        )

        if updated is None:
            raise NotFoundError("Remediation job", job.job_id)

        if job.draft_remediated_md is not None:
            # Written after the verify succeeded, so a failed verify and its retry leave one record.
            await self._repo.record_edit(
                job.job_id, previous_md, job.draft_remediated_md, edited_by,
                edit_diff_pairs(previous_md, job.draft_remediated_md), accuracy,
            )

        return updated

    async def verify(self, user: dict[str, object], job_id: str, title: str) -> RemediationJobResponse:
        job = await self.require_job(user, job_id)
        verified_by = str(user["sub"])
        return self.serialize_job(
            await self.verify_job(job, title=title, verified_by=verified_by, edited_by=verified_by)
        )

    async def translate(self, user: dict[str, object], job_id: str, target_language: str) -> RemediationJobResponse:
        job = await self.require_job(user, job_id)
        remediated_bytes, _ = await self.artifact_bytes(job, ArtifactName.REMEDIATED)

        try:
            with tempfile.TemporaryDirectory() as workspace:
                remediated_path = Path(workspace) / "remediated.md"
                remediated_path.write_bytes(remediated_bytes)
                translated_urls = await run_translation(
                    job.job_id, remediated_path, target_language, job.language, self._blob
                )

            if not translated_urls:
                raise ValidationError("Translation produced no downloadable file. Try again, or pick a different target language.")
        except ValueError as exc:
            await self._repo.set_translation_error(job.job_id, str(exc))
            raise ValidationError(str(exc)) from exc
        except Exception as exc:
            await self._repo.set_translation_error(job.job_id, str(exc))
            raise

        updated = await self._repo.record_artifacts(job.job_id, translated_urls, {})
        await self._repo.set_translation_error(job.job_id, None)

        if updated is None:
            raise NotFoundError("Remediation job", job.job_id)

        return self.serialize_job(updated)

    async def review(self, user: dict[str, object], job_id: str) -> ReviewSummaryResponse:
        job = await self.require_job(user, job_id)
        incomplete = False
        diagrams: list[DiagramResponse] = []
        if ArtifactName.ALT in job.artifacts:
            try:
                async for item in self._iter_artifact_jsonl(job, ArtifactName.ALT):
                    diagrams.append(
                        DiagramResponse(
                            id=str(item.get("id") or item.get("image_name") or f"diag_{len(diagrams) + 1}"),
                            page=item.get("page", 1),
                            image_name=str(item.get("image_name") or item.get("src") or ""),
                            alt_text=str(item.get("alt_text") or item.get("replacement") or ""),
                            status=str(item.get("status") or "described"),
                            needs_check=False,
                        )
                    )
            except Exception as exc:
                logger.warning("Failed to parse alt artifact for job %s: %s", job.job_id, exc)
                incomplete = True

        flagged_items: list[FlaggedItemResponse] = []
        if ArtifactName.UNRESOLVED in job.artifacts:
            try:
                async for item in self._iter_artifact_jsonl(job, ArtifactName.UNRESOLVED):
                    flagged_items.append(
                        FlaggedItemResponse(
                            id=str(item.get("id") or f"flag_{len(flagged_items) + 1}"),
                            page=item.get("page", 1),
                            type=str(item.get("type") or "unresolved_figure"),
                            text=str(item.get("text") or item.get("alt_text") or ""),
                            reason=str(item.get("reason") or "Needs manual check"),
                            needs_check=True,
                        )
                    )
            except Exception as exc:
                logger.warning("Failed to parse unresolved artifact for job %s: %s", job.job_id, exc)
                incomplete = True

        tables: list[dict[str, object]] = []
        if ArtifactName.REMEDIATION in job.artifacts:
            try:
                async for item in self._iter_artifact_jsonl(job, ArtifactName.REMEDIATION):
                    rule = str(item.get("rule") or "")
                    if rule == "table_summary" or "table" in rule:
                        tables.append(item)
            except Exception as exc:
                logger.warning("Failed to parse remediation artifact for job %s: %s", job.job_id, exc)
                incomplete = True

        return ReviewSummaryResponse(
            job_id=job.job_id,
            status=job.status,
            total_pages=job.metrics.total_pages if job.metrics.total_pages is not None else 1,
            diagrams_described_count=job.metrics.diagrams_described if job.metrics.diagrams_described is not None else len(diagrams),
            tables_fixed_count=job.metrics.tables_fixed if job.metrics.tables_fixed is not None else len(tables),
            flagged_items_count=job.metrics.flagged_items_count if job.metrics.flagged_items_count is not None else len(flagged_items),
            diagrams=diagrams,
            tables=tables,
            flagged_items=flagged_items,
            incomplete=incomplete,
        )

    async def image(self, user: dict[str, object], job_id: str, image_name: str) -> StreamingResponse:
        await self.require_job(user, job_id)
        safe_name = Path(image_name).name
        content_type = IMAGE_CONTENT_TYPES.get(Path(safe_name).suffix.lower())

        if content_type is None:
            raise NotFoundError("Image", safe_name)

        return await self._stream_blob(
            f"textbook-remediation/{job_id}/images/{safe_name}", content_type, "Image", safe_name
        )

    async def page(self, user: dict[str, object], job_id: str, page_num: int) -> StreamingResponse:
        job = await self.require_job(user, job_id)
        if not job.source_page_count:
            if job.status in (JobStatus.PENDING, JobStatus.RUNNING):
                raise AppError(
                    "PAGES_NOT_READY",
                    "The source pages are still being rendered. Try again in a few seconds.",
                    409,
                )

            raise NotFoundError("Page", str(page_num))

        if page_num < 1 or page_num > job.source_page_count:
            raise NotFoundError("Page", str(page_num))

        return await self._stream_blob(
            f"textbook-remediation/{job_id}/pages/{page_num}.jpg", "image/jpeg", "Page", str(page_num)
        )

    async def events(self, user: dict[str, object], job_id: str) -> AsyncIterator[str]:
        async for event in self.subscribe(str(user["tenant_id"]), job_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"


def get_textbook_remediation_service(
    db: AsyncDatabase = Depends(get_db),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> TextbookRemediationService:
    return TextbookRemediationService(db, blob_provider)
