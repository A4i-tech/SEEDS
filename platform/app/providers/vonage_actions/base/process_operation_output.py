"""Abstract base class for FSM process-operation-output contracts.

Ported from IVRv2/app/base_classes/base_process_operation_output.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from app.providers.vonage_actions.base.serializable import JsonRoundTripMixin

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc
    from app.providers.vonage_actions.base.action import Action


class ProcessOperationOutput(JsonRoundTripMixin, ABC):
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
