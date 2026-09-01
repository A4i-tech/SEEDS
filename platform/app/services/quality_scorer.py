"""Deterministic translation quality heuristic (ticket #436, AC6).

Not a model-derived confidence number (the REST Chat Completions APIs used by
OpenAITranslationProvider/GroqTranslationProvider don't request logprobs) —
this is an honest, reproducible heuristic computed from signal we actually
have: whether every masked placeholder survived translation, and whether the
translated length is a plausible rendering of the source length. Documented
as a heuristic everywhere it's surfaced (API + UI), never presented as an AI
confidence score.
"""

from __future__ import annotations

LOW_CONFIDENCE_THRESHOLD = 0.7

_PLACEHOLDER_WEIGHT = 0.6
_LENGTH_WEIGHT = 0.4


def score_translation(source_text: str, masked_translated: str, placeholder_map: dict[str, str]) -> float:
    """Score a fresh AI translation in [0.0, 1.0].

    *masked_translated* is the provider's raw output BEFORE unmask() — this
    is the only point placeholder-token survival can be checked, since
    unmask() always restores whatever tokens are present (or absent).
    """
    if not masked_translated.strip():
        return 0.0

    if placeholder_map:
        surviving = sum(1 for token in placeholder_map if token in masked_translated)
        placeholder_score = surviving / len(placeholder_map)
    else:
        placeholder_score = 1.0

    source_len = len(source_text.strip())
    translated_len = len(masked_translated.strip())
    if source_len == 0:
        length_score = 1.0 if translated_len == 0 else 0.5
    else:
        ratio = translated_len / source_len
        # Plausible translations rarely shrink/grow beyond ~3x; degrade smoothly past that.
        length_score = 1.0 if 0.3 <= ratio <= 3.0 else max(0.0, 1.0 - (abs(ratio - 1.65) / 5.0))

    score = _PLACEHOLDER_WEIGHT * placeholder_score + _LENGTH_WEIGHT * length_score
    return round(min(1.0, max(0.0, score)), 3)


def is_low_confidence(
    quality_score: float | None, threshold: float = LOW_CONFIDENCE_THRESHOLD
) -> bool:
    """True when *quality_score* exists and is below *threshold*.

    *threshold* defaults to the module constant but callers may pass
    settings.low_confidence_threshold so the flag is configurable per
    deployment without changing this leaf module.
    """
    return quality_score is not None and quality_score < threshold
