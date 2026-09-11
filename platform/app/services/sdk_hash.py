from __future__ import annotations

import hashlib


def sdk_hash_text(text: str) -> str:
    return "t" + hashlib.sha1(text.encode("utf-8")).hexdigest()
