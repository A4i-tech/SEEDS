from __future__ import annotations

import asyncio
import hashlib
import tempfile
from pathlib import Path

from bson import ObjectId
from fastapi import Depends, UploadFile
from fastapi.responses import Response
from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import ARTIFACTS, ArtifactName, JobStatus, RemediationJob
from app.models.responses.remediation import (
    BookResponse,
    CreateBookResponse,
    RemediationJobListResponse,
)
from app.models.textbook_book import MAX_BOOK_FILES, BuiltBook, CreateBookRequest, TextbookBook
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError, NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.remediation.accuracy import percent
from app.repositories.textbook_book_repository import TextbookBookRepository
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.services.textbook_remediation import TextbookRemediationService
from app.services.textbook_upload_validation import validate_book_files

BUILD_VERSION = "2-images"


class TextbookBookService:
    def __init__(self, db: AsyncDatabase, blob_provider: BlobStorageProvider) -> None:
        self._repo = TextbookRemediationRepository(db)
        self._books = TextbookBookRepository(db)
        self._blob = blob_provider
        self._remediation = TextbookRemediationService(db, blob_provider)

    @staticmethod
    def serialize_book(book: TextbookBook, edit_accuracy: float) -> BookResponse:
        return BookResponse(
            book_id=book.book_id,
            title=book.title,
            language=book.language,
            job_ids=book.job_ids,
            created_at=book.created_at,
            edit_accuracy=edit_accuracy,
        )

    @staticmethod
    def book_accuracy(children: list[RemediationJob]) -> float:
        verified = [c for c in children if c.status == JobStatus.VERIFIED]
        if not verified:
            return 0.0
        return percent(sum(c.edit_chars_changed for c in verified), sum(c.edit_chars_total for c in verified))

    @staticmethod
    def _fingerprint(children: list[RemediationJob]) -> str:
        return hashlib.sha256(
            "|".join([BUILD_VERSION, *(f"{c.job_id}:{c.verified_at}" for c in children)]).encode()
        ).hexdigest()

    async def _get_book(self, tenant_id: str, book_id: str) -> TextbookBook:
        book = await self._books.get(tenant_id, book_id)
        if book is None:
            raise NotFoundError("Book", book_id)
        return book

    async def _active_children(
        self, tenant_id: str, book: TextbookBook, *, include_draft: bool = False
    ) -> list[RemediationJob]:
        found = {
            j.job_id: j for j in await self._repo.list_by_book(tenant_id, [book.book_id], include_draft=include_draft)
        }
        return [found[i] for i in book.job_ids if i in found]

    async def _chapter_markdown(self, job: RemediationJob) -> str:
        if job.draft_remediated_md is not None:
            return job.draft_remediated_md
        data, _ = await self._remediation.artifact_bytes(job, ArtifactName.REMEDIATED)
        return data.decode("utf-8")

    async def create_book(
        self, tenant_id: str, payload: CreateBookRequest, files: list[UploadFile]
    ) -> CreateBookResponse:
        await validate_book_files(files, MAX_BOOK_FILES)
        book_id = ObjectId()
        job_ids: list[str] = []
        for file in files:
            job = await self._remediation.create_job(
                tenant_id=tenant_id, file=file,
                language=payload.language,
                target_language=payload.target_language if payload.target_language != "" else None,
                book_id=str(book_id),
            )
            job_ids.append(job.job_id)
        book = await self._books.create(
            book_id=book_id, tenant_id=tenant_id, title=payload.title, language=payload.language, job_ids=job_ids
        )
        return CreateBookResponse(book_id=book.book_id, job_ids=book.job_ids)

    async def reorder_book(self, tenant_id: str, book_id: str, job_ids: list[str]) -> BookResponse:
        book = await self._get_book(tenant_id, book_id)
        children = await self._active_children(tenant_id, book)
        current = {j.job_id for j in children}
        if len(job_ids) != len(set(job_ids)) or set(job_ids) != current:
            raise ValidationError("The new order must list every chapter of the book exactly once. Reload the page and try again.")
        updated = await self._books.set_order(tenant_id, book.book_id, job_ids)
        if updated is None:
            raise NotFoundError("Book", book.book_id)
        return self.serialize_book(updated, self.book_accuracy(children))

    async def delete_book(self, tenant_id: str, book_id: str) -> None:
        book = await self._get_book(tenant_id, book_id)
        for child in await self._active_children(tenant_id, book):
            await self._repo.soft_delete(tenant_id, child.job_id)
        await self._books.soft_delete(tenant_id, book.book_id)

    async def book_artifact(self, tenant_id: str, book_id: str, name: str) -> Response:
        book = await self._get_book(tenant_id, book_id)
        fmt = ArtifactName(name)
        children = await self._active_children(tenant_id, book, include_draft=True)
        if not children:
            raise AppError("CONFLICT", "This book has no chapters left. Upload the chapters again as a new book.", 409)
        waiting = [c.source_name for c in children if c.status != JobStatus.VERIFIED]
        if waiting:
            raise AppError(
                "CONFLICT",
                f"{len(waiting)} chapter(s) are not verified yet: {', '.join(waiting)}. Verify them, then download the book again.",
                409,
            )
        fingerprint = self._fingerprint(children)
        built = book.built
        if built.fingerprint != fingerprint or fmt.value not in built.artifacts:
            urls: dict[str, str] = {}
            with tempfile.TemporaryDirectory() as tmp:
                parts = [await self._remediation.fetch_images(c, await self._chapter_markdown(c), Path(tmp)) for c in children]
                out_docx, out_tex, out_pdf = await asyncio.to_thread(self._remediation.compile_verified, "\n\n".join(parts), Path(tmp))
                container = get_settings().azure_storage_container
                for artifact, path in ((ArtifactName.DOCX, out_docx), (ArtifactName.TEX, out_tex), (ArtifactName.PDF, out_pdf)):
                    if path:
                        with path.open("rb") as fh:
                            urls[artifact.value] = await self._blob.upload_file(
                                container, f"textbook-remediation/books/{book.book_id}/book.{artifact.value}", fh, ARTIFACTS[artifact][1]
                            )
            built = BuiltBook(fingerprint=fingerprint, artifacts=urls)
            await self._books.set_built(tenant_id, book.book_id, built)
        url = built.artifacts.get(fmt.value, "")
        if not url:
            raise AppError(
                "NOT_FOUND",
                f"The {name.upper()} of this book could not be built. Download the Word file instead, "
                "or ask an admin to check that LibreOffice is installed on the server.",
                404,
            )
        return Response(
            await self._blob.download_from_url(url), media_type=ARTIFACTS[fmt][1],
            headers={"Content-Disposition": f'attachment; filename="book.{name}"'},
        )

    async def list_jobs_with_books(
        self, tenant_id: str, volunteer: bool, assigned_to: str, limit: int
    ) -> RemediationJobListResponse:
        jobs = {j.job_id: j for j in await self._repo.list_jobs(tenant_id, limit=limit, assigned_to=assigned_to)}
        books = await self._books.list_books(tenant_id)
        if not volunteer:
            for child in await self._repo.list_by_book(tenant_id, [b.book_id for b in books]):
                jobs.setdefault(child.job_id, child)
        live = set(jobs)
        visible = [b for b in books if not volunteer or live & set(b.job_ids)]
        ordered = sorted(jobs.values(), key=lambda j: j.created_at, reverse=True)
        books_out: list[BookResponse] = []
        for b in visible:
            live_ids = [i for i in b.job_ids if i in live]
            score = 0.0 if volunteer else self.book_accuracy([jobs[i] for i in live_ids])
            books_out.append(self.serialize_book(b.model_copy(update={"job_ids": live_ids}), score))
        return RemediationJobListResponse(jobs=[self._remediation.serialize_job(job) for job in ordered], books=books_out)


def get_textbook_book_service(
    db: AsyncDatabase = Depends(get_db),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> TextbookBookService:
    return TextbookBookService(db, blob_provider)
