"""Playback speed stepping and the localised speed-control announcement."""

from __future__ import annotations

import pytest

from app.services.fsm.instantiation.speed_control import (
    MAX_SPEED,
    MIN_SPEED,
    SUPPORTED_SPEEDS,
    decrease_speed,
    get_speed_instruction,
    increase_speed,
)


@pytest.mark.parametrize(
    ("current", "expected"),
    [(0.75, (1.0, False)), (1.0, (1.25, False)), (1.25, (1.5, False)), (1.5, (2.0, True))],
)
def test_increase_walks_up_the_supported_ladder(current, expected) -> None:
    assert increase_speed(current) == expected


@pytest.mark.parametrize(
    ("current", "expected"),
    [(2.0, (1.5, False)), (1.5, (1.25, False)), (1.25, (1.0, False)), (1.0, (0.75, True))],
)
def test_decrease_walks_down_the_supported_ladder(current, expected) -> None:
    assert decrease_speed(current) == expected


def test_increase_at_max_stays_and_reports_at_max() -> None:
    assert increase_speed(MAX_SPEED) == (MAX_SPEED, True)


def test_decrease_at_min_stays_and_reports_at_min() -> None:
    assert decrease_speed(MIN_SPEED) == (MIN_SPEED, True)


@pytest.mark.parametrize("bad", [0.1, 3.0, -1.0])
def test_out_of_range_speed_is_treated_as_normal_speed(bad) -> None:
    assert increase_speed(bad) == (1.25, False)
    assert decrease_speed(bad) == (0.75, True)


def test_an_unsupported_in_range_speed_snaps_to_the_next_rung() -> None:
    assert increase_speed(1.1) == (1.25, False)
    assert decrease_speed(1.1) == (1.0, False)


def test_stepping_up_then_down_returns_to_the_start() -> None:
    for speed in SUPPORTED_SPEEDS[1:-1]:
        assert decrease_speed(increase_speed(speed)[0])[0] == speed


@pytest.mark.parametrize("language", ["kn", "en", "hi", "bn", "ta", "mr"])
def test_every_supported_language_has_its_own_instruction(language) -> None:
    assert get_speed_instruction(language) != "" 


def test_instruction_lookup_is_case_insensitive() -> None:
    assert get_speed_instruction("KN") == get_speed_instruction("kn")


def test_unknown_language_falls_back_to_english() -> None:
    assert get_speed_instruction("xx") == get_speed_instruction("en")
