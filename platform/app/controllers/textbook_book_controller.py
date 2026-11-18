from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import BaseModel, Field

from app.controllers.textbook_remediation_controller import (
    validate_language,
    validate_pdf_upload,
)
from app.models.responses.remediation import BookResponse, CreateBookResponse
from app.platform.auth.dependencies import require_tenant
from app.platform.error_handling import NotFoundError, ValidationError
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.repositories.textbook_book_repository import TextbookBookRepository, get_textbook_book_repo
from app.repositories.textbook_remediation_repository import (
    TextbookRemediationRepository,
    get_textbook_remediation_repo,
)
from app.services import textbook_book

router = APIRouter(prefix="/textbook-remediation/books", tags=["Textbook Remediation"])

MAX_BOOK_FILES = 50


class ReorderBookRequest(BaseModel):
    job_ids: list[str] = Field(max_length=MAX_BOOK_FILES)


async def _get_book(books: TextbookBookRepository, tenant_id: str, book_id: str) -> dict[str, object]:
    book = await books.get(tenant_id, book_id)
    if book is None:
        raise NotFoundError("Book", book_id)
    return book


@router.post("", status_code=202, response_model=CreateBookResponse, summary="Upload the chapter PDFs of one book in reading order")
async def create_book(
    files: list[UploadFile] = File(..., description="Chapter PDFs, in book order"),
    title: str = Form(..., min_length=1, max_length=200),
    language: str = Form("auto"),
    target_language: str = Form(""),
    user: dict[str, object] = Depends(require_tenant),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    books: TextbookBookRepository = Depends(get_textbook_book_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    if not 2 <= len(files) <= MAX_BOOK_FILES:
        raise ValidationError(
            f"A book needs 2 to {MAX_BOOK_FILES} PDFs, got {len(files)}. Upload a single PDF as a plain job instead."
        )
    title = title.strip()
    if not title:
        raise ValidationError("The book name is empty. Type a name for the book, then upload again.")
    for file in files:
        await validate_pdf_upload(file)
    if language != "auto":
        validate_language(language)
    if target_language:
        validate_language(target_language)
    book = await textbook_book.create_book(
        repo, books, blob_provider,
        tenant_id=str(user["tenant_id"]),
        title=title,
        language=language,
        target_language=target_language or None,
        files=[(file.filename or "chapter.pdf", file.file) for file in files],
    )
    return {"book_id": book["book_id"], "job_ids": book["job_ids"]}


@router.put("/{book_id}/order", response_model=BookResponse, summary="Set the chapter order of a book")
async def reorder_book(
    book_id: str,
    payload: ReorderBookRequest,
    user: dict[str, object] = Depends(require_tenant),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    books: TextbookBookRepository = Depends(get_textbook_book_repo),
) -> dict[str, object]:
    tenant_id = str(user["tenant_id"])
    book = await _get_book(books, tenant_id, book_id)
    return await textbook_book.reorder_book(repo, books, tenant_id, book, payload.job_ids)


@router.delete("/{book_id}", status_code=204, summary="Soft-delete a book and its chapters")
async def delete_book(
    book_id: str,
    user: dict[str, object] = Depends(require_tenant),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    books: TextbookBookRepository = Depends(get_textbook_book_repo),
) -> None:
    tenant_id = str(user["tenant_id"])
    await textbook_book.delete_book(repo, books, tenant_id, await _get_book(books, tenant_id, book_id))


@router.get("/{book_id}/artifacts/{name}", summary="Download the whole book as docx, tex or pdf")
async def get_book_artifact(
    book_id: str,
    name: str,
    user: dict[str, object] = Depends(require_tenant),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    books: TextbookBookRepository = Depends(get_textbook_book_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> Response:
    tenant_id = str(user["tenant_id"])
    book = await _get_book(books, tenant_id, book_id)
    data, content_type = await textbook_book.book_artifact(repo, books, blob_provider, tenant_id, book, name)
    return Response(
        data, media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="book.{name}"'},
    )
