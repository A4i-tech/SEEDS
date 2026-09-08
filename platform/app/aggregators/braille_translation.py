"""Back-translates Braille Ready Format (.brf) text into plain text via liblouis."""
from __future__ import annotations

import louis

from app.platform.error_handling import AppError

_TABLE_BY_LANGUAGE_GRADE: dict[tuple[str, int], str] = {
    ("en", 1): "en-ueb-g1.ctb",
    ("en", 2): "en-ueb-g2.ctb",
    ("hi", 1): "hi-in-g1.utb",
    ("ta", 1): "ta-ta-g1.ctb",
    ("te", 1): "te-in-g1.utb",
    ("mr", 1): "mr-in-g1.utb",
    ("kn", 1): "kn.tbl",
}


def back_translate(brf_text: str, language: str, grade: int) -> str:
    table = _TABLE_BY_LANGUAGE_GRADE.get((language, grade))
    if table is None:
        raise AppError("UNSUPPORTED_BRAILLE_GRADE", f"grade {grade} not supported for language '{language}'", 400)
    return louis.backTranslateString([table], brf_text)
