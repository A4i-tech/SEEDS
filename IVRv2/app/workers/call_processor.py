import json
import logging
import os
import time
from datetime import datetime
from typing import Dict, Any, Optional

from app.services.queue.models.queue_message import QueueMessage

import vonage
from pydantic import ValidationError

from app.workers.base_processor import BaseProcessor
from app.actions.vonage_actions.vonage_action_factory import VonageActionFactory
from app.services.service_bus_manager import service_bus_manager
from app.utils.enums import CallStatus
from app.utils.model_classes import (
    IVRCallStateMongoDoc,
    UserAction,
    VonageCallStartResponse,
)
from app.utils.mongodb import MongoDB
from app.settings import settings

# Initialize MongoDB connections
ongoing_fsm_mongo = MongoDB(collection_name="ongoingIVRState")
calls_log_mongo = MongoDB(collection_name="callLogs")
ivrv2_logs_mongo = MongoDB(collection_name="ivrv2Logs")

action_factory = VonageActionFactory()
accumulator = action_factory.get_action_accumulator_implmentation()


class CallWebhookProcessor(BaseProcessor):
    """
    Processes call webhook messages from the dedicated call webhook queue.
    Handles initiating IVR calls from missed call webhooks.
    """

    def __init__(self, fsm: Dict[str, Any]):
        """Initialize processor with FSM dictionary."""
        super().__init__()
        self.fsm = fsm
        self.latest_fsm_id: Optional[str] = None

    async def get_provider(self):
        """Get the call webhook queue provider"""
        provider = service_bus_manager.get_call_webhook_provider()
        if provider is None:
            self.log_error(
                "Call webhook provider is None - Service Bus may not be initialized"
            )
        return provider

    async def process_message(self, message: QueueMessage):
        """Process a single message from the queue."""
        await self.process_call_webhook(message.payload)

    async def process_call_webhook(self, message_data: Dict[str, Any]):
        """
        Processes a call webhook message.
        Args:
            message_data: Dictionary containing the message data.
        """
        try:
            phone_number = message_data.get("phone_number")
            call_log_id = message_data.get("call_log_id")
            self.log_info(
                f"Processing call webhook for phone: {phone_number}, call_log_id: {call_log_id}"
            )

            start_ivr_response = await self._start_ivr_internal(phone_number)

            if start_ivr_response.get("status_code") == 200:
                self.log_info(f"✓ IVR started successfully for {phone_number}")
                await calls_log_mongo.update_document(
                    call_log_id, {"status": "called", "called_at": datetime.now()}
                )
                self.log_info(f"✓ Call log updated for call_log_id: {call_log_id}")
            else:
                self.log_warning(f"✗ IVR failed to start: {start_ivr_response}")
        except Exception as e:
            self.log_error(f"✗ Error processing call webhook: {e}", exc_info=True)
            raise

    async def _start_ivr_internal(self, phone_number: str) -> Dict[str, Any]:
        """
        Internal method to start IVR for a given phone number.
        Args:
            phone_number (str): The phone number to start IVR for.
        Returns:
            Dict[str, Any]: Response indicating success or failure.
        """
        try:
            self.log_info(f"[START_IVR] Starting IVR for phone number: {phone_number}")

            # check for existing ongoing call
            self.log_debug(f"[START_IVR] Checking for existing ongoing call...")
            doc = await ongoing_fsm_mongo.find_one_by_query(
                {"phone_number": phone_number}
            )
            if doc is not None:
                ivr_state = IVRCallStateMongoDoc(**doc)
                if (datetime.now() - ivr_state.created_at).total_seconds() / 60 > int(
                    os.getenv("STALE_WAIT_IN_MINUTES", "60")
                ):
                    await ongoing_fsm_mongo.delete(phone_number)
                else:
                    self.log_info(
                        f"Ongoing IVR call already exists for phone number: {phone_number}"
                    )
                    return {
                        "status_code": 400,
                        "message": f"IVR already in progress{phone_number}",
                    }
            # create Vonage client and initiate call
            self.log_info(f"[START_IVR] Creating Vonage client...")
            self.log_debug(
                f"[START_IVR] Application ID: {os.getenv('VONAGE_APPLICATION_ID')}"
            )
            self.log_debug(
                f"[START_IVR] Private key path: {os.getenv('VONAGE_PRIVATE_KEY_PATH')}"
            )

            client = vonage.Client(
                application_id=settings.vonage_application_id,
                private_key=os.getenv("VONAGE_PRIVATE_KEY_PATH"),
            )
            self.log_info(f"[START_IVR] ✓ Vonage client created")

            self.log_info(f"[START_IVR] Getting FSM with ID: {self.latest_fsm_id}")
            latest_fsm = self.fsm.get(self.latest_fsm_id)
            if not latest_fsm:
                self.log_error(
                    f"[START_IVR] ✗ FSM not found with ID: {self.latest_fsm_id}"
                )
                return {
                    "status_code": 500,
                    "message": f"FSM not found",
                }

            self.log_info(f"[START_IVR] Building NCCO actions...")
            ncco_actions = accumulator.combine(
                [
                    action_factory.get_action_implmentation(x)
                    for x in latest_fsm.get_start_fsm_actions()
                ]
            )
            self.log_info(
                f"[START_IVR] ✓ NCCO actions built: {len(ncco_actions)} actions"
            )
            self.log_debug(f"[START_IVR] NCCO: {json.dumps(ncco_actions, indent=2)}")

            self.log_info(f"Initiating Vonage call to {phone_number}...")
            vonage_response = client.voice.create_call(
                {
                    "to": [{"type": "phone", "number": phone_number}],
                    "from": {"type": "phone", "number": settings.vonage_number},
                    "ncco": ncco_actions,
                }
            )
            self.log_info(f"[START_IVR] ✓ Vonage API call successful!")
            self.log_info(f"[START_IVR] Vonage response: {vonage_response}")
            vonage_response = VonageCallStartResponse(**vonage_response)
            self.log_info(
                f"[START_IVR] Conversation UUID: {vonage_response.conversation_uuid}"
            )
            # create ivr state
            ivr_call_state = IVRCallStateMongoDoc(
                _id=vonage_response.conversation_uuid,
                phone_number=phone_number,
                fsm_id=latest_fsm.fsm_id,
                current_state_id=latest_fsm.init_state_id,
                created_at=datetime.now(),
            )
            await ongoing_fsm_mongo.insert(ivr_call_state.dict(by_alias=True))
            self.log_info(
                f"IVR call started for phone number: {phone_number}, conversation_uuid: {vonage_response.conversation_uuid}"
            )
            return {
                "status_code": 200,
                "message": f"IVR started for phone number {phone_number}",
            }
        except Exception as e:
            self.log_error(
                f"[START_IVR] ✗ Error starting IVR for phone number {phone_number}: {e}",
                exc_info=True,
            )
            return {
                "status_code": 500,
                "message": f"Failed to start IVR: {str(e)}",
            }


class DtmfInputProcessor(BaseProcessor):
    """
    Processes DTMF input messages from the dedicated DTMF input queue.
    Handles user keypad input during IVR calls.
    """

    def __init__(self, fsm: Dict[str, Any]):
        """Initialize processor with FSM dictionary."""
        super().__init__()
        self.fsm = fsm
        self.latest_fsm_id: Optional[str] = None

    async def get_provider(self):
        """Get the DTMF input queue provider"""
        provider = service_bus_manager.get_dtmf_input_provider()
        if provider is None:
            self.log_error(
                "DTMF input provider is None - Service Bus may not be initialized"
            )
        return provider

    async def process_message(self, message: QueueMessage):
        """Process a single message from the queue."""
        await self.process_dtmf_input(message.payload)

    async def process_dtmf_input(self, message_data: Dict[str, Any]):
        """
        Process a DTMF input message
        """
        try:
            conv_id = message_data.get("conversation_uuid")
            digits = message_data.get("digits")
            self.log_info(f"Processing DTMF: conv_id={conv_id}, digits='{digits}'")

            # Get IVR state
            doc = await ongoing_fsm_mongo.find_by_id(conv_id)
            if doc is None:
                self.log_error(f"No ongoing IVR state found for conv_id: {conv_id}")
                return

            ivr_state = IVRCallStateMongoDoc(**doc)
            fsm_in_progress = self.fsm.get(ivr_state.fsm_id)
            if not fsm_in_progress:
                self.log_warning(f"No FSM found for FSM ID: {ivr_state.fsm_id}")
                return

            # Process input
            input_time = datetime.now()

            # Handle None or empty digits
            if digits is None or digits == "":
                digits = ""

            # Process each digit or handle empty input
            if digits == "":
                # Handle timeout/no input case
                pre_state_id = ivr_state.current_state_id
                next_actions, next_state_id = await fsm_in_progress.get_next_actions(
                    "", ivr_state
                )
                ivr_state.current_state_id = next_state_id
                ivr_state.user_actions.append(
                    UserAction(
                        key_pressed="empty",
                        timestamp=input_time,
                        pre_state_id=pre_state_id,
                        post_state_id=next_state_id,
                    )
                )
            else:
                # Process each digit
                for digit in digits:
                    pre_state_id = ivr_state.current_state_id
                    next_actions, next_state_id = (
                        await fsm_in_progress.get_next_actions(digit, ivr_state)
                    )
                    ivr_state.current_state_id = next_state_id
                    ivr_state.user_actions.append(
                        UserAction(
                            key_pressed=digit if digit != "" else "empty",
                            timestamp=input_time,
                            pre_state_id=pre_state_id,
                            post_state_id=next_state_id,
                        )
                    )

            # Update IVR state in database
            await ongoing_fsm_mongo.update_document(
                ivr_state.id, ivr_state.dict(by_alias=True)
            )

            self.log_info(f"✓ DTMF processed: new_state={ivr_state.current_state_id}")

        except Exception as e:
            self.log_error(f"Error processing DTMF input: {e}", exc_info=True)
            raise


class CallEventProcessor(BaseProcessor):
    """
    Processes call event messages from the dedicated call event queue.
    Handles call lifecycle events(answered, completed, etc.).
    """

    def __init__(self, fsm: Dict[str, Any]):
        """Initialize processor with FSM dictionary."""
        super().__init__()
        self.fsm = fsm
        self.latest_fsm_id: Optional[str] = None

    async def get_provider(self):
        """Get the call event queue provider"""
        provider = service_bus_manager.get_call_event_provider()
        if provider is None:
            self.log_error(
                "Call event provider is None - Service Bus may not be initialized"
            )
        return provider

    async def process_message(self, message: QueueMessage):
        """Process a single message from the queue."""
        await self.process_call_event(message.payload)

    async def process_call_event(self, message_data: Dict[str, Any]):
        """
        Processes a call event message.
        Args:
            message_data: Dictionary containing the message data.
        """
        try:
            event_data = message_data.get("event_data")
            self.log_info(f"Processing call event: {json.dumps(event_data)}")
            doc = await ongoing_fsm_mongo.find_by_id(event_data.conversation_uuid)
            if doc is None:
                self.log_warning(
                    f"No ongoing IVR state found for conversation_uuid: {event_data.conversation_uuid}"
                )
                return
            ivr_state = IVRCallStateMongoDoc(**doc)
            ivr_state.call_status_updates[event_data.timestamp] = (
                event_data.status.value
            )
            if event_data.status in CallStatus.get_end_call_enums():
                if doc is None:
                    self.log_warning(
                        f"No call log found for conversation_uuid: {event_data.conversation_uuid}"
                    )
                    return
                ivr_state.stopped_at = datetime.now()
                ivr_state.duration = event_data.duration
                doc = await ivrv2_logs_mongo.find_by_id(ivr_state.id)
                if doc is None:
                    await ivrv2_logs_mongo.insert(ivr_state.dict(by_alias=True))
                    await ongoing_fsm_mongo.delete(event_data.conversation_uuid)
                    self.log_info(
                        f"✓ Call ended and logged: {event_data.conversation_uuid}"
                    )
                else:
                    self.log_warning(
                        f"Duplicate call log entry exists for {ivr_state.id}"
                    )
            else:
                if doc is not None:
                    await ongoing_fsm_mongo.update_document(
                        ivr_state.id, ivr_state.dict(by_alias=True)
                    )
                    self.log_info(f"✓ Call state updated: {event_data.status.value}")
        except ValidationError as ve:
            self.log_error(f"Validation error processing call event: {ve}")
        except Exception as e:
            self.log_error(f"Error processing call event: {e}", exc_info=True)
            raise


# global worker instance
call_webhook_processor = None
dtmf_input_processor = None
call_event_processor = None
