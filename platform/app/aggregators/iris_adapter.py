from __future__ import annotations

import re
from typing import ClassVar

from app.aggregators.base_adapter import SourceAdapter, _now
from app.aggregators.iris_types import IrisBook, IrisTactile
from app.aggregators.models import CanonicalNode, ItemType, SourceType

_LABEL_NAME = re.compile(r"^name_(\d+)$")


def _text(tactile: IrisTactile) -> str:
    numbers = sorted(int(m.group(1)) for k in tactile.content if (m := _LABEL_NAME.match(k)))
    lines = [f"{tactile.content[f'name_{n}']}: {tactile.content[f'desc_{n}']}" for n in numbers]
    return tactile.title + "\n\n" + "\n".join(lines)


class IrisAdapter(SourceAdapter):
    source_type: ClassVar[SourceType] = SourceType.IRIS

    def is_empty(self, items: list[IrisTactile]) -> bool:
        return not items

    def build_canonical_nodes(
        self, native_book: IrisBook, native_items: list[IrisTactile], run_id: str
    ) -> list[CanonicalNode]:
        book = native_book.book_id
        now = _now()

        common = {"root_id": book, "run_id": run_id, "now": now}
        chapter, sequential, vertical = f"{book}/c", f"{book}/c/s", f"{book}/c/s/v"
        nodes = [
            self.make_container(
                book, 0, native_book.name, "book",
                meta={"book_id": book, "book_name": native_book.name}, **common,
            ),
            self.make_container(chapter, 0, native_book.name, "class", parent=book, **common),
            self.make_container(sequential, 0, native_book.name, "folder", parent=chapter, **common),
            self.make_container(vertical, 0, native_book.name, "vertical", parent=sequential, **common),
        ]

        for order, t in enumerate(native_items):
            urls = [str(u) for u in t.audio_urls]
            nodes.append(self.make_item(
                f"{book}/t{t.tactile_id}/l{t.language_id}", vertical, order, ItemType.PLAINTEXT,
                t.title, "tactile", _text(t),
                {
                    "language": t.language_id, "title_english": t.title_english,
                    "author_id": t.author_id, "is_poster": t.is_poster,
                    "tactile_id": t.tactile_id, "audio_urls": urls,
                },
                **common,
            ))
        return nodes
