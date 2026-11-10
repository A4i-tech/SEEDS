from __future__ import annotations

import pytest

from app.aggregators.hexis_adapter import HexisAdapter
from app.aggregators.hexis_types import HexisSubject
from app.aggregators.models import BlobContext
from app.serializers.content_aggregator_serializer import to_course_doc
from tests.support.fake_blob import FakeBlob


def _ctx_factory(node):
    return BlobContext(container="hexis", blob_prefix=f"hexis/241/items/{node.source_id}")


@pytest.mark.asyncio
async def test_serialize_hexis_tree_plaintext_and_quiz():
    items = [
        {"cid": "15950", "title": "NEWS WEEK 16", "class": "8", "language": "1", "subject": "3",
         "ctype": "2", "actual_content": "plain body * not markdown", "folder": "news", "common_content": "1", "author_id": "1"},
        {"cid": "42", "title": "Quiz", "class": "8", "language": "8", "subject": "3", "ctype": "3",
         "actual_content": '{"question":"2+2?","a1":"3","a2":"4","a3":"5","ca":2}', "folder": "mcq", "common_content": "0", "author_id": "1"},
    ]
    adapter = HexisAdapter()
    blob = FakeBlob()
    nodes = adapter.build_canonical_nodes(HexisSubject(subject_id="3", name="Subject 3", items=items), items, "run1")
    processed = await adapter.process_nodes(nodes, _ctx_factory, blob)

    doc = await to_course_doc(processed, blob)

    assert doc.title == "Subject 3"
    assert doc.source_type == "hexis"
    all_block_ids = {
        bid
        for chapter in doc.outline
        for seq in chapter.sequentials
        for vert in seq.verticals
        for bid in vert.block_ids
    }
    assert all_block_ids == {"15950", "42"}

    story = next(b for b in doc.blocks if b.block_id == "15950")
    assert story.markdown == "plain body * not markdown"

    quiz = next(b for b in doc.blocks if b.block_id == "42")
    assert quiz.question == "2+2?"
    assert quiz.choices[1] == {"value": "2", "text": "4", "correct": True}


@pytest.mark.asyncio
async def test_to_course_doc_returns_one_block_per_plaintext_item_for_iris_tree():
    from app.aggregators.iris_adapter import IrisAdapter
    from app.aggregators.iris_types import IrisBook, IrisTactile

    tactiles = [
        IrisTactile(tactile_id=t, language_id="1", title_english="T", title=f"Title {t}",
                    content={"name_1": "Head", "desc_1": "a"}, author_id="9", is_poster="0", audio_urls=[])
        for t in ("22", "25")
    ]
    adapter = IrisAdapter()
    blob = FakeBlob()
    nodes = adapter.build_canonical_nodes(IrisBook(book_id="101", name="Book", tactile_ids=["22", "25"]), tactiles, "r")
    processed = await adapter.process_nodes(nodes, lambda n: BlobContext(container="c", blob_prefix=n.source_id), blob)

    doc = await to_course_doc(processed, blob)

    assert doc.source_type == "iris"
    assert {b.block_id for b in doc.blocks} == {"101/t22/l1", "101/t25/l1"}
