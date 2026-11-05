from __future__ import annotations

import time
from collections import defaultdict

_WINDOW_SECONDS = 60
_MAX_REQUESTS = 10
_hits: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(key: str, max_requests: int = _MAX_REQUESTS, window_seconds: float = _WINDOW_SECONDS) -> bool:
    now = time.monotonic()
    hits = _hits[key]
    cutoff = now - window_seconds
    while hits and hits[0] < cutoff:
        hits.pop(0)
    if len(hits) >= max_requests:
        return False
    hits.append(now)
    return True
