"""Abstract base class for all IVR actions.

Ported from IVRv2/app/base_classes/action.py — unchanged except import path.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.providers.vonage_actions.base.serializable import JsonRoundTripMixin


class Action(JsonRoundTripMixin, ABC):
    """Abstract base for IVR call-control actions."""

    @abstractmethod
    def get(self, sas_gen_obj):  # type: ignore[no-untyped-def]
        pass

    def __repr__(self) -> str:
        return self.__str__()
