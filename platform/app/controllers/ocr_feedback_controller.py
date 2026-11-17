from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.responses.glossary import GlossaryStatusResponse
from app.models.responses.ocr_feedback import FeedbackCorrectionResponse
from app.platform.auth.dependencies import get_db, require_tenant
from app.platform.error_handling import AppError, ValidationError
from app.remediation.detect_language import language_name_to_code
from app.repositories.glossary_repository import GlossaryRepository
from app.repositories.ocr_correction_repository import OcrCorrectionRepository

router = APIRouter(prefix="/feedback/corrections", tags=["Feedback"])


async def _get_row(repo: OcrCorrectionRepository, correction_id: str) -> dict[str, Any]:
    row = await repo.find_by_id(correction_id)
    if row is None:
        raise AppError("NOT_FOUND", f"Correction {correction_id} does not exist. Refresh the list and try again.", 404)
    return row


@router.get("", summary="List corrections, optionally by status")
async def list_corrections(
    status: Literal["pending", "approved", "rejected"] | None = None,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_tenant),
) -> list[FeedbackCorrectionResponse]:
    rows = await OcrCorrectionRepository(db).find_by_status(status)
    return [FeedbackCorrectionResponse.model_validate(r) for r in rows]


@router.post("/{correction_id}/approve", summary="Approve a correction")
async def approve_correction(
    correction_id: str,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_tenant),
) -> GlossaryStatusResponse:
    repo = OcrCorrectionRepository(db)
    row = await _get_row(repo, correction_id)
    if row["status"] != "pending":
        raise AppError(
            "CONFLICT",
            f"Correction {correction_id} is already {row['status']}. Only pending corrections can be approved.",
            409,
        )
    if row["kind"] == "translation":
        target_lang = language_name_to_code(row["language"])
        if target_lang is None:
            raise ValidationError(
                f"Language '{row['language']}' is not supported for glossary terms. Reject this correction and resubmit it with a supported language."
            )
        await GlossaryRepository(db).add_term(
            source_term=row["wrong"], target_lang=target_lang, translated_term=row["right"]
        )
    await repo.set_status(correction_id, "approved")
    return GlossaryStatusResponse(status="approved")


@router.post("/{correction_id}/reject", summary="Reject a correction")
async def reject_correction(
    correction_id: str,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_tenant),
) -> GlossaryStatusResponse:
    repo = OcrCorrectionRepository(db)
    await _get_row(repo, correction_id)
    await repo.set_status(correction_id, "rejected")
    return GlossaryStatusResponse(status="rejected")
