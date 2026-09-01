"""Request schemas for translation review endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class TranslationUpdateRequest(BaseModel):
    lang: str
    text: str


class TranslationApproveRequest(BaseModel):
    """No fields yet — approvedBy comes from the authenticated reviewer, not the body.

    Kept as a model (not an empty body) so future fields (e.g. review notes)
    are additive, matching the rest of the review API's typed-request pattern.
    """


class TranslationRejectRequest(BaseModel):
    reason: str = ""
