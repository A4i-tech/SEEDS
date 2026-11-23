from __future__ import annotations

import re
from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator


class TranslationUpdateRequest(BaseModel):
    lang: str
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class TranslationApproveRequest(BaseModel):
    lang: str


class TranslationRejectRequest(BaseModel):
    lang: str
    reason: str = ""


class BulkApproveRequest(BaseModel):
    route: str | None = None
    lang: str | None = None


class RuleRequest(BaseModel):
    kind: Literal["exclusion", "override"]
    text: str = Field(min_length=1, max_length=5000)
    lang: str = ""
    translation: Annotated[str, StringConstraints(strip_whitespace=True)] = ""

    @field_validator("text")
    @classmethod
    def _text_has_literal(cls, value: str) -> str:
        value = value.strip()
        if not re.sub(r"[*?]", "", value):
            raise ValueError("text must contain at least one character that is not * or ?")
        return value

    @model_validator(mode="after")
    def _fields_match_kind(self) -> Self:
        if self.kind == "override" and not (self.lang and self.translation):
            raise ValueError("an override needs lang and translation")
        if self.kind == "exclusion" and (self.lang or self.translation):
            raise ValueError("an exclusion must not have lang or translation")
        return self
