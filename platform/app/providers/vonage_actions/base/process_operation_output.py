"""Abstract base class for FSM process-operation-output contracts.

Ported from IVRv2/app/base_classes/base_process_operation_output.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc
    from app.providers.vonage_actions.base.action import Action


class ProcessOperationOutput(ABC):
    """Abstract base for transforming FSM operation output into action lists."""

    @abstractmethod
    def execute(
        self,
        state: object,
        op_output: object,
        fsm_state_doc: IVRCallStateMongoDoc | None = None,
    ) -> list[Action]:
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
    def from_json(data: dict) -> ProcessOperationOutput:
        module = __import__(data["__module__"], fromlist=[data["__class__"]])
        cls = getattr(module, data["__class__"])
        obj = cls.__new__(cls)
        obj.__dict__.update(data["attributes"])
        return obj
