"""Abstract base class for FSM state operations.

Ported from IVRv2/app/base_classes/base_fsm_operation.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc
    from app.services.fsm.fsm import FSM


class FSMOperation(ABC):
    """Abstract base for synchronous FSM state operations (pre / post)."""

    @abstractmethod
    def execute(
        self,
        fsm: FSM,
        fsm_state_doc: IVRCallStateMongoDoc | None = None,
    ) -> Any:
        pass

    def __repr__(self) -> str:
        return self.__str__()

    def to_json(self) -> dict:
        return {
            "__class__": self.__class__.__name__,
            "__module__": self.__class__.__module__,
            "attributes": vars(self),
        }

    @staticmethod
    def from_json(data: dict) -> FSMOperation:
        module = __import__(data["__module__"], fromlist=[data["__class__"]])
        cls = getattr(module, data["__class__"])
        obj = cls.__new__(cls)
        obj.__dict__.update(data["attributes"])
        return obj
