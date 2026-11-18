from __future__ import annotations

from fastapi import UploadFile

from app.platform.error_handling import ValidationError
from app.services.language_registry import SUPPORTED_LANGUAGES

MAX_PDF_BYTES = 10 * 1024 * 1024

_LANGUAGE_CODES = frozenset(lang["code"] for lang in SUPPORTED_LANGUAGES)


def validate_language(value: str) -> None:
    if value not in _LANGUAGE_CODES:
        raise ValidationError(f"{value!r} is not a supported language. Pick a language from GET /v1/languages.")


async def validate_pdf_upload(file: UploadFile) -> None:
    if file.content_type != "application/pdf":
        raise ValidationError(f"Expected a PDF for {file.filename}, got {file.content_type!r}")
    header = await file.read(5)
    if header != b"%PDF-":
        raise ValidationError(f"File {file.filename} is not a PDF")
    file.file.seek(0, 2)
    size = file.file.tell()
    if size > MAX_PDF_BYTES:
        raise ValidationError(
            f"{file.filename} is {size / (1024 * 1024):.1f} MB. The limit is {MAX_PDF_BYTES // (1024 * 1024)} MB. "
            "Split the book into chapter PDFs or compress the file, then upload again."
        )
    await file.seek(0)


async def validate_book_files(files: list[UploadFile], limit: int) -> None:
    if not 2 <= len(files) <= limit:
        raise ValidationError(
            f"A book needs 2 to {limit} PDFs, got {len(files)}. Upload a single PDF as a plain job instead."
        )
    for file in files:
        await validate_pdf_upload(file)
