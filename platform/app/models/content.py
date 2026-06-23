"""Content domain model (unified from ContentV3.js and Content.js)."""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import Field

from app.models.base import BaseDocument


class TextContent(BaseDocument):
    """Bilingual text with optional audio URL."""

    english: str
    local: str = ""
    audio_url: str = ""  # alias: audioUrl


class AudioContent(BaseDocument):
    """A single audio segment within a content item."""

    description: str = ""
    audio_url: str  # alias: audioUrl
    duration_seconds: float | None = None  # alias: durationSeconds


class Content(BaseDocument):
    """Unified content document covering both contentsV2 and contentsV3 collections.

    Use the ``version`` field to distinguish:
      - "v2" : legacy (contentsV2 collection, flat string fields)
      - "v3" : current (contentsV3 collection, structured TextContent fields)
    """

    id: str | None = Field(None, alias="_id")
    version: str = "v3"
    tenant_id: str | None = None        # alias: tenantId
    description: str = ""
    type: str
    language: str
    # V3 structured title/theme
    title: TextContent | None = None
    theme: TextContent | None = None
    # V2 flat title/theme fields
    title_text: str | None = None       # alias: titleText
    local_title: str | None = None      # alias: localTitle
    title_audio: str | None = None      # alias: titleAudio
    theme_text: str | None = None       # alias: themeText
    local_theme: str | None = None      # alias: localTheme
    theme_audio: str | None = None      # alias: themeAudio
    # Audio content (v3)
    audio_content: list[AudioContent] = Field(default_factory=list)  # alias: audioContent
    # Flags
    school_id: str | None = None        # alias: schoolId
    created_by: str = ""                # alias: createdBy
    is_pull_model: bool = False         # alias: isPullModel
    is_teacher_app: bool = False        # alias: isTeacherApp
    is_processed: bool = False          # alias: isProcessed
    is_deleted: bool = False            # alias: isDeleted
    creation_time: int = -1
    created_at: datetime | None = None  # alias: createdAt
    updated_at: datetime | None = None  # alias: updatedAt

    @classmethod
    def from_mongo(cls, doc: dict) -> Content:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        for key in ("tenantId", "tenant_id", "schoolId", "school_id"):
            if key in d and isinstance(d[key], ObjectId):
                d[key] = str(d[key])
        return cls.model_validate(d)


class ContentCreate(BaseDocument):
    """Payload for creating a new content item."""

    tenant_id: str
    description: str = ""
    type: str
    language: str
    version: str = "v3"
    title: TextContent | None = None
    theme: TextContent | None = None
    audio_content: list[AudioContent] = Field(default_factory=list)  # alias: audioContent
    school_id: str | None = None        # alias: schoolId
    created_by: str = ""                # alias: createdBy
    is_pull_model: bool = False         # alias: isPullModel
    is_teacher_app: bool = False        # alias: isTeacherApp
    creation_time: int = -1
