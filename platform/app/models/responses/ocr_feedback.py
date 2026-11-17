from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCorrectionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    kind: str
    language: str
    wrong: str
    right: str
    status: str
    page: int | None = None
