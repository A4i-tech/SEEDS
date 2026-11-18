from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile

from app.models.responses.remediation import BookResponse, CreateBookResponse
from app.models.textbook_book import CreateBookRequest, ReorderBookRequest
from app.platform.auth.dependencies import require_tenant
from app.services.textbook_book import TextbookBookService, get_textbook_book_service

router = APIRouter(prefix="/textbook-remediation/books", tags=["Textbook Remediation"])


@router.post("", status_code=202, response_model=CreateBookResponse, summary="Upload the chapter PDFs of one book in reading order")
async def create_book(
    payload: Annotated[CreateBookRequest, Form()],
    files: list[UploadFile] = File(..., description="Chapter PDFs, in book order"),
    user: dict[str, object] = Depends(require_tenant),
    service: TextbookBookService = Depends(get_textbook_book_service),
) -> CreateBookResponse:
    return await service.create_book(str(user["tenant_id"]), payload, files)


@router.put("/{book_id}/order", response_model=BookResponse, summary="Set the chapter order of a book")
async def reorder_book(
    book_id: str,
    payload: ReorderBookRequest,
    user: dict[str, object] = Depends(require_tenant),
    service: TextbookBookService = Depends(get_textbook_book_service),
) -> BookResponse:
    return await service.reorder_book(str(user["tenant_id"]), book_id, payload.job_ids)


@router.delete("/{book_id}", status_code=204, summary="Soft-delete a book and its chapters")
async def delete_book(
    book_id: str,
    user: dict[str, object] = Depends(require_tenant),
    service: TextbookBookService = Depends(get_textbook_book_service),
) -> None:
    await service.delete_book(str(user["tenant_id"]), book_id)


@router.get("/{book_id}/artifacts/{name}", summary="Download the whole book as docx, tex or pdf")
async def get_book_artifact(
    book_id: str,
    name: Literal["docx", "tex", "pdf"],
    user: dict[str, object] = Depends(require_tenant),
    service: TextbookBookService = Depends(get_textbook_book_service),
) -> Response:
    return await service.book_artifact(str(user["tenant_id"]), book_id, name)
