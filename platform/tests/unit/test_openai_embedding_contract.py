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
    with patch("app.services.audio.hold_detector.get_settings", return_value=settings):
        return HoldDetector()


async def test_no_key_and_no_base_url_keeps_rule_based_detection():
    d = _detector()
    assert d.client is None
    result = await d.detect("Thank you for holding. Please stay on the line.")
    assert result["detection_method"] == "rule_based_exact_phrase"


@needs_mock
async def test_embeddings_from_mock_server_are_1536_wide_and_deterministic():
    d = _detector(embedding_base_url=MOCK_URL)
    first = await d._get_embeddings(["hello world"])
    second = await d._get_embeddings(["hello world"])
    assert len(first[0]) == 1536
    assert first == second


async def test_empty_base_url_keeps_rule_based_detection():
    d = _detector(embedding_base_url="   ")
    assert d.client is None
    result = await d.detect("Thank you for holding. Please stay on the line.")
    assert result["detection_method"] == "rule_based_exact_phrase"
