from __future__ import annotations

import time
from collections import defaultdict, deque

_WINDOW_SECONDS = 60
_MAX_REQUESTS = 10
_hits: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str) -> bool:
    now = time.monotonic()
    hits = _hits[key]
    cutoff = now - _WINDOW_SECONDS
    while hits and hits[0] < cutoff:
        hits.popleft()
    if len(hits) >= _MAX_REQUESTS:
        return False
    hits.append(now)
    return True
