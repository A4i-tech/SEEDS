from __future__ import annotations

from app.aggregators.models import SourceType
from app.platform.settings import Settings


def test_source_type_iris_value():
    assert SourceType("iris") is SourceType.IRIS


def test_iris_settings_defaults():
    s = Settings()
    assert s.iris_base_url == "https://vembi.in/iris/api/php"
    assert s.iris_book_concurrency == 4
