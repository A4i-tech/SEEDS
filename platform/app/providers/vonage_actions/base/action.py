"""Abstract base class for all IVR actions.

Ported from IVRv2/app/base_classes/action.py — unchanged except import path.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class Action(ABC):
    """Abstract base for IVR call-control actions."""

    @abstractmethod
    def get(self, sas_gen_obj):  # type: ignore[no-untyped-def]
        pass

    def __repr__(self) -> str:
        return self.__str__()

    def to_json(self) -> dict:
        """Serialize the action to a JSON-compatible dict."""
        return {
            "__class__": self.__class__.__name__,
            "__module__": self.__class__.__module__,
            "attributes": vars(self),
        }

    @staticmethod
    def from_json(data: dict) -> Action:
        """Deserialize a dict (produced by ``to_json``) back into an Action."""
        module = __import__(data["__module__"], fromlist=[data["__class__"]])
        cls = getattr(module, data["__class__"])
        obj = cls.__new__(cls)
        obj.__dict__.update(data["attributes"])
        return obj
