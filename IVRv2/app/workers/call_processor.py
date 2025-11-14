import json
import logging
import os
import time
from datetime import datetime
from typing import Dict, Any

from app.services.queue.models.queue_message import QueueMessage

import vonage
from pydantic import ValidationError

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

logger = logging.getLogger(__name__)

# Initialize MongoDB connections
ongoing_fsm_mongo = MongoDB(collection_name="ongoingIVRState")
calls_log_mongo = MongoDB(collection_name="callLogs")
ivrv2_logs_mongo = MongoDB(collection_name="ivrv2Logs")

action_factory = VonageActionFactory()
accumulator = action_factory.get_action_accumulator_implmentation()


class CallWebhookProcessor:
    """
    Processes call webhook messages from the dedicated call webhook queue.
    Handles initiating IVR calls from missed call webhooks.
    """

    def __init__(self, fsm_dict: Dict):
        logger.info("CallWebhookProcessor initialized.")
        self.fsm = fsm_dict
        self.latest_fsm_id = None
        self.running = False

    def update_fsm(self, fsm_dict: Dict, latest_id: str):
        """Updates the FSM reference from main application"""
        self.fsm = fsm_dict
        self.latest_fsm_id = latest_id
        logger.info(f"CallWebhookProcessor FSM updated to ID: {latest_id}")

    async def process_call_webhook(self, message_data: Dict[str, Any]):
        """
        Processes a call webhook message.
        Args:
            message_data: Dictionary containing the message data.
        """
        try:
            phone_number = message_data.get("phone_number")
            call_log_id = message_data.get("call_log_id")
            logger.info(
                f"[CALL_WEBHOOK] Processing call webhook for phone number: {phone_number}, call_log_id: {call_log_id}"
            )
            logger.info(f"[CALL_WEBHOOK] Message data: {message_data}")

            logger.info(
                f"[CALL_WEBHOOK] Calling _start_ivr_internal for {phone_number}..."
            )
            start_ivr_response = await self._start_ivr_internal(phone_number)
            logger.info(
                f"[CALL_WEBHOOK] _start_ivr_internal response: {start_ivr_response}"
            )

            if start_ivr_response.get("status_code") == 200:
                logger.info(
                    f"[CALL_WEBHOOK] ✓ IVR started successfully for phone number: {phone_number}"
                )
                await calls_log_mongo.update_document(
                    call_log_id, {"status": "called", "called_at": datetime.now()}
                )
                logger.info(
                    f"[CALL_WEBHOOK] ✓ Call log updated for call_log_id: {call_log_id} to 'called' status."
                )
            else:
                logger.warning(
                    f"[CALL_WEBHOOK] ✗ IVR failed to start: {start_ivr_response}"
                )
        except Exception as e:
            logger.error(
                f"[CALL_WEBHOOK] ✗ Error processing call webhook message: {e}",
                exc_info=True,
            )

    async def _start_ivr_internal(self, phone_number: str) -> Dict[str, Any]:
        """
        Internal method to start IVR for a given phone number.
        Args:
            phone_number (str): The phone number to start IVR for.
        Returns:
            Dict[str, Any]: Response indicating success or failure.
        """
        try:
            logger.info(f"[START_IVR] Starting IVR for phone number: {phone_number}")

            # check for existing ongoing call
            logger.debug(f"[START_IVR] Checking for existing ongoing call...")
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
                    logger.info(
                        f"Ongoing IVR call already exists for phone number: {phone_number}"
                    )
                    return {
                        "status_code": 400,
                        "message": f"IVR already in progress{phone_number}",
                    }
            # create Vonage client and initiate call
            logger.info(f"[START_IVR] Creating Vonage client...")
            logger.debug(
                f"[START_IVR] Application ID: {os.getenv('VONAGE_APPLICATION_ID')}"
            )
            logger.debug(
                f"[START_IVR] Private key path: {os.getenv('VONAGE_PRIVATE_KEY_PATH')}"
            )

            client = vonage.Client(
                application_id=settings.vonage_application_id,
                private_key=settings.vonage_private_key_path,
            )
            logger.info(f"[START_IVR] ✓ Vonage client created")

            logger.info(f"[START_IVR] Getting FSM with ID: {self.latest_fsm_id}")
            latest_fsm = self.fsm.get(self.latest_fsm_id)
            if not latest_fsm:
                logger.error(
                    f"[START_IVR] ✗ FSM not found with ID: {self.latest_fsm_id}"
                )
                return {
                    "status_code": 500,
                    "message": f"FSM not found",
                }

            logger.info(f"[START_IVR] Building NCCO actions...")
            ncco_actions = accumulator.combine(
                [
                    action_factory.get_action_implmentation(x)
                    for x in latest_fsm.get_start_fsm_actions()
                ]
            )
            logger.info(
                f"[START_IVR] ✓ NCCO actions built: {len(ncco_actions)} actions"
            )
            logger.debug(f"[START_IVR] NCCO: {json.dumps(ncco_actions, indent=2)}")

            logger.info(f"[START_IVR] Initiating Vonage call to {phone_number}...")
            logger.debug(f"[START_IVR] From number: {os.getenv('VONAGE_NUMBER')}")
            logger.debug(
                f"[START_IVR] Call duration limit: {os.getenv('CALL_DURATION_LIMIT')} seconds"
            )
            vonage_response = client.voice.create_call(
                {
                    "to": [{"type": "phone", "number": phone_number}],
                    "from": {"type": "phone", "number": settings.vonage_number},
                    "ncco": ncco_actions,
                    "length_timer": int(settings.call_duration_limit),
                }
            )
            logger.info(f"[START_IVR] ✓ Vonage API call successful!")
            logger.info(f"[START_IVR] Vonage response: {vonage_response}")
            vonage_response = VonageCallStartResponse(**vonage_response)
            logger.info(
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
            logger.info(
                f"IVR call started for phone number: {phone_number}, conversation_uuid: {vonage_response.conversation_uuid}"
            )
            return {
                "status_code": 200,
                "message": f"IVR started for phone number {phone_number}",
            }
        except Exception as e:
            logger.error(
                f"[START_IVR] ✗ Error starting IVR for phone number {phone_number}: {e}",
                exc_info=True,
            )
            return {
                "status_code": 500,
                "message": f"Failed to start IVR: {str(e)}",
            }

    async def process_message(self, message: QueueMessage):
        """
        Processes a call webhook message.
        Args:
            message: QueueMessage: The message to process.
        """
        try:
            message_data = message.payload
            await self.process_call_webhook(message_data)
        except Exception as e:
            logger.error(f"Error processing call webhook message: {e}", exc_info=True)

    async def start(self):
        """
        Starts the CallWebhookProcessor to listen for messages.
        """
        if self.running:
            logger.warning("CallWebhookProcessor is already running.")
            return
        self.running = True
        logger.info("CallWebhookProcessor started.")
        provider = service_bus_manager.get_call_webhook_provider()

        try:
            while self.running:
                messages = await provider.receive_messages(10, 5)

                for message in messages:
                    try:
                        await self.process_message(message)
                        await provider.delete_message(message)
                    except Exception as e:
                        logger.error(f"Error processing message: {e}", exc_info=True)
                        await provider.return_message_to_queue(message)
        except Exception as e:
            logger.error(f"Error in CallWebhookProcessor: {e}", exc_info=True)

    async def stop(self):
        """Stop the processor"""
        self.running = False
        logger.info("CallWebhookProcessor stopped.")


class DtmfInputProcessor:
    """
    Processes DTMF input messages from the dedicated DTMF input queue.
    Handles user keypad input during IVR calls.
    """

    def __init__(self, fsm_dict: Dict):
        logger.info("DtmfInputProcessor initialized.")
        self.fsm = fsm_dict
        self.latest_fsm_id = None
        self.running = False

    def update_fsm(self, fsm_dict: Dict, latest_id: str):
        """Updates the FSM reference from main application"""
        self.fsm = fsm_dict
        self.latest_fsm_id = latest_id
        logger.info(f"DtmfInputProcessor FSM updated to ID: {latest_id}")

    async def process_dtmf_input(self, message_data: Dict[str, Any]):
        """
        Process a DTMF input message
        """
        try:
            conv_id = message_data.get("conversation_uuid")
            digits = message_data.get("digits")
            input_data = message_data.get("input_data")
            logger.info(
                f"Processing DTMF input for conversation_uuid: {conv_id}, digits: {digits}"
            )

            # Get IVR state

            doc = await ongoing_fsm_mongo.find_by_id(conv_id)
            if doc is None:
                logger.warning(
                    f"No ongoing IVR state found for conversation_uuid: {conv_id}"
                )
                return
            ivr_state = IVRCallStateMongoDoc(**doc)
            fsm_in_progress = self.fsm.get(ivr_state.fsm_id)
            if not fsm_in_progress:
                logger.warning(f"No FSM found for FSM ID: {ivr_state.fsm_id}")
                return
            # process input
            input_time = datetime.now()
            next_actions, next_state_id = None, None

            if digits == "":
                digits = [""]

            for digit in digits:
                pre_state_id = ivr_state.current_state_id
                next_actions, next_state_id = await fsm_in_progress.get_next_actions(
                    digit, ivr_state
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

            # update ivr state in db
            await ongoing_fsm_mongo.update_document(
                ivr_state.id, ivr_state.dict(by_alias=True)
            )

            # generate NCCO

            start = time.time()

            ncco = accumulator.combine(
                [action_factory.get_action_implmentation(x) for x in next_actions],
            )

            logger.info(
                f"NCCO generation took {time.time() - start} seconds for conversation_uuid: {conv_id}"
            )
            logger.debug(f"Generated NCCO: {json.dumps(ncco, indent=2)}")
        except Exception as e:
            logger.error(f"Error processing DTMF input message: {e}", exc_info=True)

    async def process_messages(self, message: QueueMessage):
        """
        Processes a DTMF input message.
        Args:
            message: QueueMessage: The message to process.
        """
        try:
            message_data = message.payload
            await self.process_dtmf_input(message_data)
        except Exception as e:
            logger.error(f"Error processing DTMF input message: {e}", exc_info=True)

    async def start(self):
        """
        Starts the DtmfInputProcessor to listen for messages.
        """
        if self.running:
            logger.warning("DtmfInputProcessor is already running.")
            return
        self.running = True
        logger.info("DtmfInputProcessor started.")
        provider = service_bus_manager.get_dtmf_input_provider()

        try:
            while self.running:
                messages = await provider.receive_messages(10, 5)

                for message in messages:
                    try:
                        await self.process_messages(message)
                        await provider.delete_message(message)
                    except Exception as e:
                        logger.error(f"Error processing message: {e}", exc_info=True)
                        await provider.return_message_to_queue(message)
        except Exception as e:
            logger.error(f"Error in DtmfInputProcessor: {e}", exc_info=True)

    async def stop(self):
        """Stop the processor"""
        self.running = False
        logger.info("DtmfInputProcessor stopped.")


class CallEventProcessor:
    """
    Processes call event messages from the dedicated call event queue.
    Handles call lifecycle events(answered, completed, etc.).
    """

    def __init__(self, fsm_dict: Dict):
        logger.info("CallEventProcessor initialized.")
        self.fsm = fsm_dict
        self.latest_fsm_id = None
        self.running = False

    def update_fsm(self, fsm_dict: Dict, latest_id: str):
        """Updates the FSM reference from main application"""
        self.fsm = fsm_dict
        self.latest_fsm_id = latest_id
        logger.info(f"CallEventProcessor FSM updated to ID: {latest_id}")

    async def process_call_event(self, message_data: Dict[str, Any]):
        """
        Processes a call event message.
        Args:
            message_data: Dictionary containing the message data.
        """
        try:
            event_data = message_data.get("event_data")
            logger.info(f"Processing call event: {json.dumps(event_data)}")
            doc = await ongoing_fsm_mongo.find_by_id(event_data.conversation_uuid)
            if doc is None:
                logger.warning(
                    f"No ongoing IVR state found for conversation_uuid: {event_data.conversation_uuid}"
                )
                return
            ivr_state = IVRCallStateMongoDoc(**doc)
            ivr_state.call_status_updates[event_data.timestamp] = (
                event_data.status.value
            )
            if event_data.status in CallStatus.get_end_call_enums():
                if doc is None:
                    logger.warning(
                        f"No call log found for conversation_uuid: {event_data.conversation_uuid}"
                    )
                    return
                ivr_state.stopped_at = datetime.now()
                ivr_state.duration = event_data.duration
                doc = await ivrv2_logs_mongo.find_by_id(ivr_state.id)
                if doc is None:
                    await ivrv2_logs_mongo.insert(ivr_state.dict(by_alias=True))
                    await ongoing_fsm_mongo.delete(event_data.conversation_uuid)
                    logger.info(
                        f"IVR call ended and logs updated for conversation_uuid: {event_data}"
                    )
                else:
                    logger.info(f"Doc already exists and duplicate key error for {doc}")
            else:
                if doc is not None:
                    await ongoing_fsm_mongo.update_document(
                        ivr_state.id, ivr_state.dict(by_alias=True)
                    )
                    logger.info(
                        f"IVR state updated for conversation_uuid: {event_data.conversation_uuid}"
                    )
        except ValidationError as ve:
            logger.error(f"Validation error processing call event message: {ve}")
        except Exception as e:
            logger.error(f"Error processing call event message: {e}")

    async def process_messages(self, message: QueueMessage):
        """
        Processes a call event message.
        Args:
            message: QueueMessage: The message to process.
        """
        try:
            message_data = message.payload
            await self.process_call_event(message_data)
        except Exception as e:
            logger.error(f"Error processing call event message: {e}", exc_info=True)

    async def start(self):
        """Starts the CallProcessor to listen for messages."""
        self.running = True
        logger.info("CallProcessor started.")
        provider = service_bus_manager._provider

        try:
            while self.running:
                messages = await provider.receive_messages(10, 5)

                for message in messages:
                    try:
                        await self.process_message(message)
                        await provider.delete_message(message)
                    except Exception as e:
                        logger.error(f"Failed to process message: {e}")
                        await provider.return_message_to_queue(message)
        except Exception as e:
            logger.error(f"Error in CallProcessor: {e}")

    async def stop(self):
        """Stop the processor"""
        self.running = False
        logger.info("CallEventProcessor stopped.")


# global worker instance
call_webhook_processor = None
dtmf_input_processor = None
call_event_processor = None
