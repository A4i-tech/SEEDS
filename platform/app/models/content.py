"""Content domain model (unified from ContentV3.js and Content.js)."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class TextContent(BaseModel):
    """Bilingual text with optional audio URL."""

    english: str
    local: str = ""
    audio_url: str = Field(default="", alias="audioUrl")

    model_config = ConfigDict(populate_by_name=True)


class AudioContent(BaseModel):
    """A single audio segment within a content item."""

    description: str = ""
    audio_url: str = Field(..., alias="audioUrl")
    duration_seconds: Optional[float] = Field(None, alias="durationSeconds")

    model_config = ConfigDict(populate_by_name=True)


class Content(BaseModel):
    """Unified content document covering both contentsV2 and contentsV3 collections.

    Use the ``version`` field to distinguish:
      - "v2" : legacy (contentsV2 collection, flat string fields)
      - "v3" : current (contentsV3 collection, structured TextContent fields)
    """

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    version: str = "v3"  # "v2" or "v3"
    tenant_id: Optional[str] = None  # ObjectId stored as str; ref Tenant
    description: str = ""
    type: str
    language: str
    # V3 structured title/theme
    title: Optional[TextContent] = None
    theme: Optional[TextContent] = None
    # V2 flat title/theme fields
    title_text: Optional[str] = Field(None, alias="titleText")
    local_title: Optional[str] = Field(None, alias="localTitle")
    title_audio: Optional[str] = Field(None, alias="titleAudio")
    theme_text: Optional[str] = Field(None, alias="themeText")
    local_theme: Optional[str] = Field(None, alias="localTheme")
    theme_audio: Optional[str] = Field(None, alias="themeAudio")
    # Audio content (v3)
    audio_content: List[AudioContent] = Field(default_factory=list, alias="audioContent")
    # Flags
    school_id: Optional[str] = Field(None, alias="schoolId")
    created_by: str = Field(default="", alias="createdBy")
    is_pull_model: bool = Field(default=False, alias="isPullModel")
    is_teacher_app: bool = Field(default=False, alias="isTeacherApp")
    is_processed: bool = Field(default=False, alias="isProcessed")
    is_deleted: bool = Field(default=False, alias="isDeleted")
    creation_time: int = -1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_mongo(cls, doc: dict) -> "Content":
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        if "tenant_id" in d and isinstance(d["tenant_id"], ObjectId):
            d["tenant_id"] = str(d["tenant_id"])
        return cls.model_validate(d)


class ContentCreate(BaseModel):
    """Payload for creating a new content item."""

    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str
    description: str = ""
    type: str
    language: str
    version: str = "v3"
    title: Optional[TextContent] = None
    theme: Optional[TextContent] = None
    audio_content: List[AudioContent] = Field(default_factory=list, alias="audioContent")
    school_id: Optional[str] = Field(None, alias="schoolId")
    created_by: str = Field(default="", alias="createdBy")
    is_pull_model: bool = Field(default=False, alias="isPullModel")
    is_teacher_app: bool = Field(default=False, alias="isTeacherApp")
    creation_time: int = -1
