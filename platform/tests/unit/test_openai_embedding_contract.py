from __future__ import annotations

import urllib.request
from unittest.mock import patch

import pytest

from app.platform.settings import Settings
from app.services.audio.hold_detector import HoldDetector

MOCK_URL = "http://localhost:8000/v1"


def _mock_up() -> bool:
    try:
        urllib.request.urlopen("http://localhost:8000/health", timeout=1)
    except OSError:
        return False
    return True


needs_mock = pytest.mark.skipif(not _mock_up(), reason="mock model server not answering on http://localhost:8000/health")


def _detector(**overrides) -> HoldDetector:
    settings = Settings(_env_file=None, **overrides)
    detector = HoldDetector()
    with patch("app.services.audio.hold_detector.get_settings", return_value=settings):
        detector._init_client()
    return detector


def test_client_gets_base_url_and_model_from_settings():
    d = _detector(openai_api_key="k", embedding_base_url="http://emb.local/v1", embedding_model="bge-small")
    assert str(d.client.base_url) == "http://emb.local/v1/"
    assert d.model == "bge-small"


def test_embedding_base_url_falls_back_to_shared_url_and_can_be_overridden():
    assert str(_detector(openai_base_url="http://shared.local/v1").client.base_url) == "http://shared.local/v1/"
    own = _detector(openai_base_url="http://shared.local/v1", embedding_base_url="http://emb.local/v1")
    assert str(own.client.base_url) == "http://emb.local/v1/"


async def test_no_key_and_no_base_url_keeps_rule_based_detection():
    d = _detector()
    assert d.client is None
    result = await d.detect("Thank you for holding. Please stay on the line.")
    assert result["detection_method"] == "rule_based_exact_phrase"


@needs_mock
async def test_embeddings_from_mock_server_are_1536_wide_and_deterministic():
    d = _detector(openai_base_url=MOCK_URL)
    first = await d._get_embeddings(["hello world"])
    second = await d._get_embeddings(["hello world"])
    assert len(first[0]) == 1536
    assert first == second


@needs_mock
async def test_detector_loads_reference_embeddings_and_scores_unrelated_text():
    d = _detector(openai_base_url=MOCK_URL)
    await d._load_embeddings()
    assert len(d.hold_embeddings) == len(d.hold_phrases)
    result = await d.detect("please book a doctor appointment tomorrow")
    assert result["detection_method"] == "semantic_similarity"
    assert -1.0 <= result["score"] <= 1.0
