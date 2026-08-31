from __future__ import annotations

import pytest

from app.aggregators.braille_translation import back_translate
from app.platform.error_handling import AppError


def test_back_translate_english_grade1():
    assert back_translate("hello", "en", 1) == "hello"


def test_back_translate_english_grade2():
    assert back_translate("hello", "en", 2) == "hello"


def test_back_translate_rejects_unsupported_grade():
    with pytest.raises(AppError) as exc:
        back_translate("hello", "hi", 2)
    assert exc.value.code == "UNSUPPORTED_BRAILLE_GRADE"


def test_back_translate_rejects_unsupported_language():
    with pytest.raises(AppError) as exc:
        back_translate("hello", "xx", 1)
    assert exc.value.code == "UNSUPPORTED_BRAILLE_GRADE"
