"""Content domain model (unified from ContentV3.js and Content.js)."""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class TextContent(BaseModel):
    english: str
    local: str = ""
    audio_url: str = ""

    model_config = ConfigDict(populate_by_name=True)


class AudioContent(BaseModel):
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
    tenant_id: str | None = None
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
    audio_content: list[AudioContent] = Field(default_factory=list)
    # Flags
    school_id: str | None = None
    created_by: str = ""
    is_pull_model: bool = False
    is_teacher_app: bool = False
    is_processed: bool = False
    is_deleted: bool = False
    creation_time: int = -1
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> Content:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        for key in ("_id", "tenant_id", "school_id"):
            if key in d and isinstance(d[key], ObjectId):
                d[key] = str(d[key])
        return cls.model_validate(d)


class ContentCreate(BaseModel):
    """Payload for creating a new content item."""

    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str
    description: str = ""
    type: str
    language: str
    version: str = "v3"
    title: TextContent | None = None
    theme: TextContent | None = None
    audio_content: list[AudioContent] = Field(default_factory=list)
    school_id: str | None = None
    created_by: str = ""
    is_pull_model: bool = False
    is_teacher_app: bool = False
    creation_time: int = -1
