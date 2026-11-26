from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator


class TranslationUpdateRequest(BaseModel):
    lang: str
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


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
    lang: str = Field(default="", max_length=32)
    translation: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)] = ""

    @field_validator("text")
    @classmethod
    def _text_has_literal(cls, value: str) -> str:
        value = value.strip()
        if not value.strip("*?"):
            raise ValueError("Rule text needs plain text besides * and ?. Example: Dates or Grade ?.")
        return value

    @model_validator(mode="after")
    def _fields_match_kind(self) -> Self:
        if self.kind == "override" and not (self.lang and self.translation):
            raise ValueError("An override rule needs a language and a translation.")
        if self.kind == "exclusion" and (self.lang or self.translation):
            raise ValueError("An exclusion rule cannot have a language or a translation. Clear both, or change the type to Override.")
        return self
