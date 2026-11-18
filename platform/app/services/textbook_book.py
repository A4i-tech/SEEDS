from __future__ import annotations

import asyncio
import hashlib
import logging
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import IO

from bson import ObjectId

from app.models.remediation_job import ARTIFACTS, ArtifactName, JobStatus, RemediationJob
from app.platform.error_handling import AppError, NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.repositories.textbook_book_repository import TextbookBookRepository
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.services.textbook_remediation import (
    _compile_verified,
    artifact_bytes,
    create_job,
    fetch_images,
)

logger = logging.getLogger(__name__)

# Change this when the build output changes, so books built earlier are rebuilt.
BUILD_VERSION = "2-images"
BOOK_FORMATS = (ArtifactName.DOCX, ArtifactName.TEX, ArtifactName.PDF)
CompileFn = Callable[[str, Path], Awaitable[tuple[Path, Path, Path | None]]]


async def _compile_in_thread(markdown: str, out_dir: Path) -> tuple[Path, Path, Path | None]:
    return await asyncio.to_thread(_compile_verified, markdown, out_dir)


async def create_book(
    repo: TextbookRemediationRepository,
    books: TextbookBookRepository,
    blob_provider: BlobStorageProvider,
    *,
    tenant_id: str,
    title: str,
    language: str,
    target_language: str | None,
    files: list[tuple[str, IO[bytes]]],
) -> dict[str, object]:
    book_id = ObjectId()
    job_ids: list[str] = []
    try:
        for name, data in files:
            job = await create_job(
                repo, blob_provider, tenant_id=tenant_id, source_name=name, data=data,
                language=language, target_language=target_language, book_id=str(book_id),
            )
            job_ids.append(job.job_id)
    except Exception:
        # No book record exists yet, so remove the chapters saved so far.
        for job_id in job_ids:
            await repo.soft_delete(tenant_id, job_id)
        raise
    return await books.create(book_id=book_id, tenant_id=tenant_id, title=title, language=language, job_ids=job_ids)


async def active_children(
    repo: TextbookRemediationRepository, tenant_id: str, book: dict[str, object], *, include_draft: bool = False
) -> list[RemediationJob]:
    found = {j.job_id: j for j in await repo.list_by_book(tenant_id, [str(book["book_id"])], include_draft=include_draft)}
    return [found[i] for i in book["job_ids"] if i in found]


async def reorder_book(
    repo: TextbookRemediationRepository,
    books: TextbookBookRepository,
    tenant_id: str,
    book: dict[str, object],
    job_ids: list[str],
) -> dict[str, object]:
    current = {j.job_id for j in await active_children(repo, tenant_id, book)}
    if len(job_ids) != len(set(job_ids)) or set(job_ids) != current:
        raise ValidationError("The new order must list every chapter of the book exactly once. Reload the page and try again.")
    updated = await books.set_order(tenant_id, str(book["book_id"]), job_ids)
    if updated is None:
        raise NotFoundError("Book", str(book["book_id"]))
    return updated


async def delete_book(
    repo: TextbookRemediationRepository, books: TextbookBookRepository, tenant_id: str, book: dict[str, object]
) -> None:
    for child in await active_children(repo, tenant_id, book):
        await repo.soft_delete(tenant_id, child.job_id)
    await books.soft_delete(tenant_id, str(book["book_id"]))


def book_accuracy(children: list[RemediationJob]) -> float | None:
    """Character accuracy over the verified chapters, weighted by length. None until one is verified."""
    verified = [c for c in children if c.status == JobStatus.VERIFIED]
    scored = [c for c in verified if c.edit_chars_total is not None]
    # A chapter verified before scoring existed has no counts, so a partial total would mislead.
    if not scored or len(scored) != len(verified):
        return None
    total = sum(c.edit_chars_total for c in scored)
    return 100.0 if total == 0 else round(100 * (1 - sum(c.edit_chars_changed for c in scored) / total), 1)


def _fingerprint(children: list[RemediationJob]) -> str:
    # A chapter verified again gets a new verified_at, so the stored build goes stale.
    return hashlib.sha256("|".join([BUILD_VERSION, *(f"{c.job_id}:{c.verified_at}" for c in children)]).encode()).hexdigest()


async def _chapter_markdown(job: RemediationJob, blob_provider: BlobStorageProvider) -> str:
    if job.draft_remediated_md:
        return job.draft_remediated_md
    data, _ = await artifact_bytes(job, ArtifactName.REMEDIATED, blob_provider)
    return data.decode("utf-8")


async def book_artifact(
    repo: TextbookRemediationRepository,
    books: TextbookBookRepository,
    blob_provider: BlobStorageProvider,
    tenant_id: str,
    book: dict[str, object],
    name: str,
    compile_book: CompileFn = _compile_in_thread,
) -> tuple[bytes, str]:
    if name not in {f.value for f in BOOK_FORMATS}:
        raise ValidationError(f"Unknown book file {name!r}. Use docx, tex or pdf.")
    fmt = ArtifactName(name)
    children = await active_children(repo, tenant_id, book, include_draft=True)
    if not children:
        raise AppError("CONFLICT", "This book has no chapters left. Upload the chapters again as a new book.", 409)
    waiting = [c.source_name for c in children if c.status != JobStatus.VERIFIED]
    if waiting:
        raise AppError(
            "CONFLICT",
            f"{len(waiting)} chapter(s) are not verified yet: {', '.join(waiting)}. Verify them, then download the book again.",
            409,
        )
    fingerprint = _fingerprint(children)
    built = book.get("built") or {}
    if built.get("fingerprint") != fingerprint:
        urls: dict[str, str] = {}
        with tempfile.TemporaryDirectory() as tmp:
            try:
                parts = [await fetch_images(c, await _chapter_markdown(c, blob_provider), Path(tmp), blob_provider) for c in children]
                out_docx, out_tex, out_pdf = await compile_book("\n\n".join(parts), Path(tmp))
            except Exception as exc:
                logger.error("Could not build book %s: %s", book["book_id"], exc)
                raise ValidationError(f"Could not build the book: {exc}") from exc
            container = get_settings().azure_storage_container
            for artifact, path in ((ArtifactName.DOCX, out_docx), (ArtifactName.TEX, out_tex), (ArtifactName.PDF, out_pdf)):
                if path and path.exists():
                    with path.open("rb") as fh:
                        urls[artifact] = await blob_provider.upload_file(
                            container, f"textbook-remediation/books/{book['book_id']}/book.{artifact}", fh, ARTIFACTS[artifact][1]
                        )
        built = {"fingerprint": fingerprint, "artifacts": urls}
        await books.set_built(tenant_id, str(book["book_id"]), built)
    url = built["artifacts"].get(fmt)
    if url is None:
        raise NotFoundError("Book file", f"{book['book_id']}/{name}")
    return await blob_provider.download_from_url(url), ARTIFACTS[fmt][1]
