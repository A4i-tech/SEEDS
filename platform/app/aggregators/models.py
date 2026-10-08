"""Canonical content_aggregators domain model — typed DTOs, not dict[str, Any].

Mongo (dict) conversion happens only at the repository boundary via to_doc()/
from_doc(); everything above that boundary works with these dataclasses.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import NotRequired, TypedDict


class NodeKind(StrEnum):
    CONTAINER = "container"
    ITEM = "item"


class SourceType(StrEnum):
    SUBODHA = "subodha"
    HEXIS = "hexis"
    PARTNER = "partner"


class QuizChoice(TypedDict):
    text: str
    value: NotRequired[str]
    correct: NotRequired[bool]


class ItemType(StrEnum):
    TEXT = "text"
    PLAINTEXT = "plaintext"
    VIDEO = "video"
    QUIZ = "quiz"
    DISCUSSION = "discussion"
    OTHER = "other"
    AUDIO = "audio"
    BRAILLE = "braille"


@dataclass(frozen=True)
class BlobContext:
    container: str
    blob_prefix: str


@dataclass(frozen=True)
class TextContent:
    markdown_url: str = ""
    raw_html_url: str = ""
    conversion_failed: bool = False

    def to_dict(self) -> dict[str, str | bool]:
        d: dict[str, str | bool] = {}
        if self.markdown_url:
            d["markdown_url"] = self.markdown_url
        if self.raw_html_url:
            d["raw_html_url"] = self.raw_html_url
        if self.conversion_failed:
            d["conversion_failed"] = True
        return d

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> TextContent:
        return cls(
            markdown_url=d.get("markdown_url", ""),
            raw_html_url=d.get("raw_html_url", ""),
            conversion_failed=bool(d.get("conversion_failed", False)),
        )


@dataclass(frozen=True)
class VideoContent:
    sources: list[str]
    streams: str | None
    poster_url: str | None
    transcript_languages: dict[str, str]

    def to_dict(self) -> dict[str, object]:
        return {
            "sources": self.sources, "streams": self.streams,
            "poster_url": self.poster_url, "transcript_languages": self.transcript_languages,
        }

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> VideoContent:
        return cls(
            sources=list(d["sources"]), streams=d["streams"],
            poster_url=d["poster_url"], transcript_languages=dict(d["transcript_languages"]),
        )


@dataclass(frozen=True)
class AudioContent:
    audio_url: str

    def to_dict(self) -> dict[str, str]:
        return {"audio_url": self.audio_url}

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> AudioContent:
        return cls(audio_url=d["audio_url"])


@dataclass(frozen=True)
class BrailleContent:
    brf_url: str
    braille_grade: int = 1

    def to_dict(self) -> dict[str, object]:
        return {"brf_url": self.brf_url, "braille_grade": self.braille_grade}

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> BrailleContent:
        return cls(brf_url=d["brf_url"], braille_grade=d["braille_grade"])


@dataclass(frozen=True)
class QuizContent:
    raw_html_url: str
    question: str = ""
    choices: list[QuizChoice] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"raw_html_url": self.raw_html_url}
        if self.question:
            d["question"] = self.question
        if self.choices:
            d["choices"] = self.choices
        return d

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> QuizContent:
        return cls(raw_html_url=d["raw_html_url"], question=d.get("question", ""), choices=d.get("choices", []))


@dataclass(frozen=True)
class DiscussionContent:
    raw_html_url: str

    def to_dict(self) -> dict[str, str]:
        return {"raw_html_url": self.raw_html_url}

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> DiscussionContent:
        return cls(raw_html_url=d["raw_html_url"])


@dataclass(frozen=True)
class OtherContent:
    payload: dict[str, object]

    def to_dict(self) -> dict[str, object]:
        return dict(self.payload)

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> OtherContent:
        return cls(payload=dict(d))


ContentPayload = (
    TextContent | VideoContent | QuizContent | DiscussionContent | OtherContent
    | AudioContent | BrailleContent
)
RawItemPayload = str | dict[str, object]

_CONTENT_TYPE_BY_ITEM_TYPE: dict[ItemType, type[ContentPayload]] = {
    ItemType.TEXT: TextContent, ItemType.PLAINTEXT: TextContent, ItemType.VIDEO: VideoContent,
    ItemType.QUIZ: QuizContent, ItemType.DISCUSSION: DiscussionContent, ItemType.OTHER: OtherContent,
    ItemType.AUDIO: AudioContent, ItemType.BRAILLE: BrailleContent,
}


def content_dto_for_item_type(item_type: ItemType) -> type[ContentPayload]:
    return _CONTENT_TYPE_BY_ITEM_TYPE[item_type]


@dataclass
class CanonicalNode:
    source_type: SourceType
    source_id: str
    root_id: str
    parent_id: str | None
    order: int
    node_kind: NodeKind
    item_type: ItemType | None
    display_name: str
    content: ContentPayload | None
    lms_url: str
    native_type: str
    source_metadata: dict[str, object]
    last_run_id: str
    fetched_at: str
    created_at: str
    updated_at: str
    is_deleted: bool = False
    deleted_at: str = ""
    raw: RawItemPayload = ""

    def to_doc(self) -> dict[str, object]:
        doc: dict[str, object] = {
            "source_type": self.source_type, "source_id": self.source_id,
            "root_id": self.root_id, "parent_id": self.parent_id, "order": self.order,
            "node_kind": self.node_kind.value, "item_type": self.item_type.value if self.item_type else None,
            "display_name": self.display_name, "content": self.content.to_dict() if self.content else None,
            "lms_url": self.lms_url, "native_type": self.native_type, "source_metadata": self.source_metadata,
            "last_run_id": self.last_run_id, "fetched_at": self.fetched_at,
            "created_at": self.created_at, "updated_at": self.updated_at,
            "is_deleted": self.is_deleted, "deleted_at": self.deleted_at,
        }
        return doc

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> CanonicalNode:
        item_type = ItemType(doc["item_type"]) if doc["item_type"] else None
        content = None
        if doc["content"] is not None and item_type is not None:
            content = content_dto_for_item_type(item_type).from_dict(doc["content"])
        return cls(
            source_type=SourceType(doc["source_type"]), source_id=doc["source_id"],
            root_id=doc["root_id"], parent_id=doc["parent_id"], order=doc["order"],
            node_kind=NodeKind(doc["node_kind"]), item_type=item_type, display_name=doc["display_name"],
            content=content, lms_url=doc["lms_url"] or "", native_type=doc["native_type"],
            source_metadata=doc["source_metadata"], last_run_id=doc["last_run_id"], fetched_at=doc["fetched_at"],
            created_at=doc["created_at"], updated_at=doc["updated_at"],
            is_deleted=doc.get("is_deleted", False), deleted_at=doc.get("deleted_at") or "",
        )
