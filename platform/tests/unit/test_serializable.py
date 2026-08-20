"""Unit tests for JsonRoundTripMixin (to_json/from_json class+dict round trip)."""

from __future__ import annotations

from app.providers.vonage_actions.base.serializable import JsonRoundTripMixin


class _Widget(JsonRoundTripMixin):
    def __init__(self, name: str, count: int) -> None:
        self.name = name
        self.count = count


class _Strict(JsonRoundTripMixin):
    """from_json must never call __init__ — only __new__ + __dict__.update."""

    def __init__(self) -> None:
        raise AssertionError("should never be called by from_json")


class TestJsonRoundTripMixin:
    def test_to_json_captures_class_module_and_attributes(self) -> None:
        w = _Widget("gear", 3)
        data = w.to_json()
        assert data["__class__"] == "_Widget"
        assert data["__module__"] == __name__
        assert data["attributes"] == {"name": "gear", "count": 3}

    def test_from_json_reconstructs_equivalent_instance(self) -> None:
        w = _Widget("gear", 3)
        restored = JsonRoundTripMixin.from_json(w.to_json())
        assert isinstance(restored, _Widget)
        assert restored.name == "gear"
        assert restored.count == 3

    def test_from_json_does_not_call_init(self) -> None:
        """from_json uses __new__ + __dict__.update — a class whose __init__ would raise
        must still deserialize fine since __init__ is never invoked."""
        data = {"__class__": "_Strict", "__module__": __name__, "attributes": {"x": 1}}
        restored = JsonRoundTripMixin.from_json(data)
        assert restored.x == 1
