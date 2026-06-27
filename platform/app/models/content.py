"""Content domain model (unified from ContentV3.js and Content.js)."""

from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class TextContent(BaseModel):
    """Bilingual text with optional audio URL."""

    english: str
    local: str = ""
    audio_url: str = ""

    model_config = ConfigDict(populate_by_name=True)


class AudioContent(BaseModel):
    """A single audio segment within a content item."""

    description: str = ""
    audio_url: str = ""
    duration_seconds: float | None = None

    model_config = ConfigDict(populate_by_name=True)


class Content(BaseModel):
    """Unified content document covering both contentsV2 and contentsV3 collections.

    Use the ``version`` field to distinguish:
      - "v2" : legacy (contentsV2 collection, flat string fields)
      - "v3" : current (contentsV3 collection, structured TextContent fields)
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    version: str = "v3"
    tenant_id: str | None = Field(None, alias="tenantId")
    description: str = ""
    type: str
    language: str
    # V3 structured title/theme
    title: TextContent | None = None
    theme: TextContent | None = None
    # V2 flat title/theme fields
    title_text: str | None = Field(None, alias="titleText")
    local_title: str | None = Field(None, alias="localTitle")
    title_audio: str | None = Field(None, alias="titleAudio")
    theme_text: str | None = Field(None, alias="themeText")
    local_theme: str | None = Field(None, alias="localTheme")
    theme_audio: str | None = Field(None, alias="themeAudio")
    # Audio content (v3)
    audio_content: list[AudioContent] = Field(default_factory=list, alias="audioContent")
    # Flags
    school_id: str | None = Field(None, alias="schoolId")
    created_by: str = Field("", alias="createdBy")
    is_pull_model: bool = Field(False, alias="isPullModel")
    is_teacher_app: bool = Field(False, alias="isTeacherApp")
    is_processed: bool = Field(False, alias="isProcessed")
    is_deleted: bool = Field(False, alias="isDeleted")
    creation_time: int = -1
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> Content:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


