import pytest

from app.utils.speed_control import (
    increase_speed,
    decrease_speed,
    MIN_SPEED,
    MAX_SPEED,
    SUPPORTED_SPEEDS,
)


class TestIncreaseSpeed:
    @pytest.mark.parametrize("current, expected", [
        (1.0,  (1.25, False)),   # normal step up
        (1.25, (1.5,  False)),   # normal step up
        (1.5,  (2.0,  True)),    # 1.75 not supported → snaps to 2.0 (max)
        (0.75, (1.0,  False)),   # from minimum
        (2.0,  (2.0,  True)),    # already at max → clamped, at_max=True
    ])
    def test_standard_cases(self, current, expected):
        assert increase_speed(current) == expected

    @pytest.mark.parametrize("invalid", [5.0, -1.0, 0.5, 3.0])
    def test_invalid_input_resets_to_default_then_increases(self, invalid):
        # Out-of-range → resets to 1.0 → increases to 1.25
        assert increase_speed(invalid) == (1.25, False)


class TestDecreaseSpeed:
    @pytest.mark.parametrize("current, expected", [
        (1.0,  (0.75, True)),    # hits minimum
        (1.25, (1.0,  False)),   # normal step down
        (1.5,  (1.25, False)),   # normal step down
        (2.0,  (1.5,  False)),   # from maximum (1.75 snaps to 1.5)
        (0.75, (0.75, True)),    # already at min → clamped, at_min=True
    ])
    def test_standard_cases(self, current, expected):
        assert decrease_speed(current) == expected

    @pytest.mark.parametrize("invalid", [5.0, -1.0, 0.5, 3.0])
    def test_invalid_input_resets_to_default_then_decreases(self, invalid):
        # Out-of-range → resets to 1.0 → decreases to 0.75
        assert decrease_speed(invalid) == (0.75, True)


class TestSpeedBoundaries:
    def test_increase_never_exceeds_max(self):
        speed = MIN_SPEED
        for _ in range(20):
            speed, _ = increase_speed(speed)
        assert speed == MAX_SPEED

    def test_decrease_never_goes_below_min(self):
        speed = MAX_SPEED
        for _ in range(20):
            speed, _ = decrease_speed(speed)
        assert speed == MIN_SPEED

    def test_all_results_are_supported_speeds(self):
        for speed in SUPPORTED_SPEEDS:
            new, _ = increase_speed(speed)
            assert new in SUPPORTED_SPEEDS
            new, _ = decrease_speed(speed)
            assert new in SUPPORTED_SPEEDS
