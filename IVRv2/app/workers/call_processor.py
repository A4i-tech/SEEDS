import json
import logging
import os
import time
import base64
import asyncio
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
ivrv2_logs_mongo = MongoDB(collection_name="ivrV2Logs")

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
        self.log_info(f"Received message from queue: {message.message_id}")
        await self.process_call_webhook(message.payload)

    async def process_call_webhook(self, message_data: Dict[str, Any]):
        """
        Processes a call webhook message.
        Args:
            message_data: Dictionary containing the message data.
        """
        try:
            webhook_received_time = time.time()
            phone_number = message_data.get("phone_number")
            call_log_id = message_data.get("call_log_id")
            self.log_info(
                f"[WEBHOOK_PROCESSOR] Starting processing for phone: {phone_number}, call_log_id: {call_log_id} (timestamp: {webhook_received_time})"
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
            start_time = time.time()
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
            raw_key = base64.b64decode(
                settings.vonage_application_private_key64
            ).decode("utf-8")
            client = vonage.Client(
                application_id=settings.vonage_application_id,
                private_key=raw_key,
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
            vonage_start_time = time.time()
            vonage_response = client.voice.create_call(
                {
                    "to": [{"type": "phone", "number": phone_number}],
                    "from": {"type": "phone", "number": settings.vonage_number},
                    "ncco": ncco_actions,
                }
            )
            vonage_elapsed = time.time() - vonage_start_time
            self.log_info(
                f"[START_IVR] ✓ Vonage API call successful! (took {vonage_elapsed:.2f}s)"
            )
            self.log_info(f"[START_IVR] Vonage response: {vonage_response}")
            vonage_response = VonageCallStartResponse(**vonage_response)
            self.log_info(
                f"[START_IVR] Conversation UUID: {vonage_response.conversation_uuid}"
            )

            # CRITICAL: Create ivr state IMMEDIATELY after getting conversation_uuid
            # This prevents race condition where events arrive before state is created
            ivr_call_state = IVRCallStateMongoDoc(
                _id=vonage_response.conversation_uuid,
                phone_number=phone_number,
                fsm_id=latest_fsm.fsm_id,
                current_state_id=latest_fsm.init_state_id,
                created_at=datetime.now(),
            )
            mongo_start_time = time.time()
            insert_result = await ongoing_fsm_mongo.insert(
                ivr_call_state.dict(by_alias=True)
            )
            mongo_elapsed = time.time() - mongo_start_time
            self.log_info(
                f"[START_IVR] ✓ IVR state created in DB for conversation_uuid: {vonage_response.conversation_uuid} (took {mongo_elapsed:.2f}s), insert_id: {insert_result}"
            )

            # VERIFY: Immediately check if the document can be retrieved
            verify_doc = await ongoing_fsm_mongo.find_by_id(
                vonage_response.conversation_uuid
            )
            if verify_doc is None:
                self.log_error(
                    f"[START_IVR] ✗ CRITICAL: Document was inserted but cannot be retrieved! conversation_uuid: {vonage_response.conversation_uuid}"
                )
            else:
                self.log_info(
                    f"[START_IVR] ✓ Verified: Document is retrievable immediately after insert"
                )

            total_elapsed = time.time() - start_time
            self.log_info(
                f"IVR call started for phone number: {phone_number}, conversation_uuid: {vonage_response.conversation_uuid} (total time: {total_elapsed:.2f}s)"
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
        self.log_info(
            f"Received message from queue: {message.message_id}, type: {message.type}"
        )
        # Filter: only process dtmf_input messages
        if message.type.value != "dtmf_input":
            self.log_debug(f"Skipping message type: {message.type.value}")
            from app.workers.base_processor import SkipMessageError

            raise SkipMessageError(
                f"Message type {message.type.value} not for DtmfInputProcessor"
            )
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
        self.log_info(
            f"Received message from queue: {message.message_id}, type: {message.type}"
        )
        # Filter: only process call_event messages
        if message.type.value != "call_event":
            self.log_debug(f"Skipping message type: {message.type.value}")
            from app.workers.base_processor import SkipMessageError

            raise SkipMessageError(
                f"Message type {message.type.value} not for CallEventProcessor"
            )
        await self.process_call_event(message.payload)

    async def process_call_event(self, message_data: Dict[str, Any]):
        """
        Processes a call event message.
        Args:
            message_data: Dictionary containing the message data directly (not wrapped).
        """
        try:
            # Log the raw payload for debugging
            self.log_info(f"Processing call event: {json.dumps(message_data)}")

            # Get conversation_uuid directly from message_data
            conversation_uuid = message_data.get("conversation_uuid")
            if not conversation_uuid:
                self.log_error(f"No conversation_uuid in event data: {message_data}")
                return

            status = message_data.get("status")
            timestamp_str = message_data.get("timestamp")
            duration = message_data.get("duration")

            # Retry logic: Wait for IVR state to be created (handles race condition)
            doc = None
            max_retries = 5
            retry_delay = 1.0  # seconds

            for attempt in range(max_retries):
                doc = await ongoing_fsm_mongo.find_by_id(conversation_uuid)
                if doc is not None:
                    break

                if attempt < max_retries - 1:
                    # Only wait if we have retries left
                    self.log_debug(
                        f"IVR state not found for {conversation_uuid} (status: {status}), attempt {attempt + 1}/{max_retries}, waiting {retry_delay}s..."
                    )
                    await asyncio.sleep(retry_delay)

            if doc is None:
                # After retries, still not found
                if status in ["started", "ringing"]:
                    self.log_debug(
                        f"IVR state not found after {max_retries} retries for early event: {conversation_uuid} (status: {status}) - may be external call"
                    )
                else:
                    self.log_warning(
                        f"No ongoing IVR state found after {max_retries} retries for conversation_uuid: {conversation_uuid} (status: {status}) - call may have ended before state was created"
                    )
                return

            ivr_state = IVRCallStateMongoDoc(**doc)

            # Parse timestamp and store with string key to avoid Pydantic serialization issues
            if timestamp_str:
                if isinstance(timestamp_str, str):
                    timestamp = datetime.fromisoformat(
                        timestamp_str.replace("Z", "+00:00")
                    )
                else:
                    timestamp = timestamp_str
                # Store with ISO format string as key
                ivr_state.call_status_updates[timestamp.isoformat()] = status

            # Check if this is an end-call status
            try:
                status_enum = CallStatus(status)
                if status_enum in CallStatus.get_end_call_enums():
                    ivr_state.stopped_at = datetime.now()
                    ivr_state.duration = duration

                    log_doc = await ivrv2_logs_mongo.find_by_id(ivr_state.id)
                    if log_doc is None:
                        await ivrv2_logs_mongo.insert(ivr_state.dict(by_alias=True))
                        await ongoing_fsm_mongo.delete(conversation_uuid)
                        self.log_info(f"✓ Call ended and logged: {conversation_uuid}")
                    else:
                        self.log_warning(
                            f"Duplicate call log entry exists for {ivr_state.id}"
                        )
                else:
                    # Update ongoing state
                    await ongoing_fsm_mongo.update_document(
                        ivr_state.id, ivr_state.dict(by_alias=True)
                    )
                    self.log_info(f"✓ Call state updated: {status}")
            except ValueError:
                self.log_warning(f"Unknown call status: {status}")

        except ValidationError as ve:
            self.log_error(f"Validation error processing call event: {ve}")
        except Exception as e:
            self.log_error(f"Error processing call event: {e}", exc_info=True)
            raise


# global worker instance
call_webhook_processor = None
dtmf_input_processor = None
call_event_processor = None
