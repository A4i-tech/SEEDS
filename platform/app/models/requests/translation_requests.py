"""Request schemas for translation review endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class TranslationUpdateRequest(BaseModel):
    lang: str
    text: str


class TranslationApproveRequest(BaseModel):
    """approvedBy comes from the authenticated reviewer, not the body.

    lang is required: approval is per-language — approving one language on a
    document must never approve any other language on the same document.
    """

    lang: str


class TranslationRejectRequest(BaseModel):
    """lang is required: rejection is per-language, same reasoning as approve."""

    lang: str
    reason: str = ""


class BulkApproveRequest(BaseModel):
    """Optional filters; omit both to approve every pending language on every doc for the site."""

    route: str | None = None
    lang: str | None = None
