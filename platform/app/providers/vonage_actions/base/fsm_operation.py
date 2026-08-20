"""Abstract base class for FSM state operations.

Ported from IVRv2/app/base_classes/base_fsm_operation.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from app.providers.vonage_actions.base.serializable import JsonRoundTripMixin

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc
    from app.services.fsm.fsm import FSM


class FSMOperation(JsonRoundTripMixin, ABC):
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
