from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TypedDict

from pydantic import BaseModel, ConfigDict, Field

HexisContentItem = TypedDict(
    "HexisContentItem",
    {
        "cid": str,
        "subject": str,
        "class": str,
        "folder": str,
        "ctype": str,
        "title": str,
        "actual_content": str,
        "language": str,
        "common_content": str,
        "author_id": str,
    },
)


class HexisContentType(StrEnum):
    NOTES = "1"
    STORY = "2"
    MCQ = "3"


class HexisMcq(TypedDict, total=False):
    question: str
    a1: str
    a2: str
    a3: str
    ca: int


@dataclass(frozen=True)
class HexisSubject:
    subject_id: str
    name: str
    items: list[HexisContentItem]


class HexisLoginResponse(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)

    access_token: str = Field(alias="accessToken", min_length=1)
