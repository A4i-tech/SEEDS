"""Shared to_json/from_json round-trip mixin for Action, FSMOperation, ProcessOperationOutput."""

from __future__ import annotations

from typing import TypeVar

T = TypeVar("T", bound="JsonRoundTripMixin")


class JsonRoundTripMixin:
    """Serialize/deserialize an instance by class path + __dict__, no field whitelist."""

    def to_json(self) -> dict:
        return {
            "__class__": self.__class__.__name__,
            "__module__": self.__class__.__module__,
            "attributes": vars(self),
        }

    @staticmethod
    def from_json(data: dict) -> T:  # type: ignore[type-var]
        module = __import__(data["__module__"], fromlist=[data["__class__"]])
        cls = getattr(module, data["__class__"])
        obj = cls.__new__(cls)
        obj.__dict__.update(data["attributes"])
        return obj
