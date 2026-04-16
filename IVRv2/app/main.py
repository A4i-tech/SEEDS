import json
import base64
from fastapi import FastAPI, Request, Response, HTTPException, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from datetime import datetime
import time
from app.utils.enums import CallStatus, ConversationRTCEventType
from app.utils.functions import CustomJSONEncoder, format_data_html
import vonage
from fastapi.responses import JSONResponse
import traceback
from dotenv import load_dotenv
import os
import asyncio
from app.actions.base_actions.talk_action import TalkAction
from app.services.service_bus_manager import service_bus_manager
from app.workers.call_processor import (
    CallWebhookProcessor,
    DtmfInputProcessor,
    CallEventProcessor,
)
from app.settings import settings
from app.actions.vonage_actions.vonage_action_factory import VonageActionFactory
from app.fsm.insti import instantiate_from_latest_content, instantitate_from_doc
from app.fsm.radio_instantiation import instantiate_from_content_ids
from app.core.lifespan import lifespan
from app.core.state import get_app_state
from fastapi.responses import HTMLResponse
from app.fsm.visualiseIVR import get_latest_content, process_content
from app.utils.model_classes import (
    ConversationRTCWebhookRequest,
    DTMFInput,
    EventWebhookRequest,
    IVRCallStateMongoDoc,
    IVRfsmDoc,
    StartIVRFormData,
    StreamPlaybackInfo,
    UserAction,
    VonageCallStartResponse,
    BulkCallRequest,
)
import copy

# from comprehension_model_classes import fsm as comprehension_fsm
import logging
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from app.core.telemetry import configure_telemetry, get_tracer
from app.application_logger.azure_app_insights import AppInsightsLogHandler

# Configure telemetry once for the entire application
configure_telemetry()

tracer = get_tracer(__name__)
logging = AppInsightsLogHandler.getLogger(__name__)

load_dotenv()

application_id = os.getenv("VONAGE_APPLICATION_ID")

STATUS_OK = 200
STATUS_BAD_REQUEST = 400

# Application state is managed via lifespan context manager
# Access via get_app_state() from app.core.state

app = FastAPI(
    title="IVR v2 API",
    description="""
    IVR v2 API - Interactive Voice Response System
    
    This API handles voice call interactions, call management, and IVR state management.
    It integrates with Vonage for voice call functionality and MongoDB for data persistence.
    """,
    version="2.0.0",
    contact={"name": "SEEDS Support", "email": "support@seeds.org"},
    license_info={"name": "MIT License"},
    lifespan=lifespan,
)
FastAPIInstrumentor.instrument_app(app)
# Add CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # List of allowed origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

action_factory = VonageActionFactory()

accumulator = action_factory.get_action_accumulator_implmentation()


@app.get(
    "/ivr_structure",
    response_class=HTMLResponse,
    summary="Get IVR structure visualization",
    description="""
    Returns an HTML visualization of the IVR call flow structure.
    
    This endpoint generates a visual representation of the IVR states and transitions
    to help with debugging and understanding the call flow.
    """,
    responses={
        200: {"description": "HTML page with IVR structure visualization"},
        500: {"description": "Error generating visualization"},
    },
)
async def get_ivr_structure():
    content = await get_latest_content()
    structured_content = process_content(content)
    logging.info(f"Structured content: {structured_content}")
    html_content = format_data_html(structured_content)
    return html_content


@app.get(
    "/getFSM",
    summary="Retrieve FSM by ID",
    description="""
    Retrieves a Finite State Machine (FSM) configuration by its unique identifier.
    
    This endpoint returns the complete FSM configuration including states, transitions,
    and menu definitions. The FSM defines the call flow and behavior of the IVR system.
    
    The response includes:
    - FSM ID and metadata
    - List of states with their configurations
    - Transition maps between states
    - Menu definitions for each state (if applicable)
    """,
    response_model=IVRfsmDoc,
    responses={
        200: {"description": "FSM retrieved successfully"},
        404: {"description": "FSM not found"},
        500: {"description": "Internal server error"},
    },
)
async def get_fsm(
    fsm_id: str = Query(..., description="The unique identifier of the FSM to retrieve")
):
    # Get state from lifespan-managed app state
    state = get_app_state()
    fsm_json_mongo = state.fsm_json_mongo
    radio_fsm_mongo = state.radio_fsm_mongo

    fsm_by_id = None
    doc = await fsm_json_mongo.find_by_id(fsm_id)
    if doc is not None:
        fsm_by_id = instantitate_from_doc(IVRfsmDoc(**doc))
    else:
        doc = await radio_fsm_mongo.find_by_id(fsm_id)
        if doc is not None:
            fsm_by_id = instantitate_from_doc(IVRfsmDoc(**doc))
    # fsm_by_id = fsm.get(fsm_id)
    if fsm_by_id is not None:
        new_fsm = copy.deepcopy(fsm_by_id)
        states = []
        for state_id in fsm_by_id.states:
            logging.debug(f"STATE: {state_id}")
            state_object = fsm_by_id.states[state_id]
            logging.debug(f"STATE OBJECT fsm.states[state]: {state_object}")
            new_state = dict()
            new_state["id"] = state_object.id
            new_state["menu"] = (
                state_object.menu.dict(by_alias=True)
                if state_object.menu is not None
                else None
            )
            new_state["transition_map"] = state_object.serialize_transitions()
            states.append(new_state)
        new_fsm.states = states
        return new_fsm
    else:
        raise HTTPException(status_code=404, detail="FSM not found")


@app.post(
    "/updateivr",
    summary="Update IVR configuration",
    description="""
    Updates the IVR configuration with the latest content.
    
    This endpoint will:
    - Check for any active calls
    - Create a new FSM from the latest content
    - Update the FSM in the database if changes are detected
    """,
    responses={
        200: {"description": "IVR updated successfully"},
        409: {"description": "Cannot update IVR while users are active"},
        500: {"description": "Failed to update IVR configuration"},
    },
)
async def update_ivr(request: Request, response: Response):
    # Get state from lifespan-managed app state
    state = get_app_state()
    fsm = state.fsm
    ongoing_fsm_mongo = state.ongoing_fsm_mongo
    fsm_json_mongo = state.fsm_json_mongo

    # FIND ONGOING FSM COUNT
    docs = await ongoing_fsm_mongo.find_all()
    if len(docs) > 0:
        response.status_code = 409
        return {
            "message": f"Cannot Update IVR right now. {len(docs)} users are currently using it. Please try again after an hour.",
            "status_code": response.status_code,
        }

    updated_fsm = await instantiate_from_latest_content(
        contents_v3_collection=state.contents_v3_mongo
    )
    fsm[updated_fsm.fsm_id] = updated_fsm
    state.latest_fsm_id = updated_fsm.fsm_id
    # fsm = await instantiate_from_latest_content()
    current_fsm_doc = updated_fsm.serialize()

    response_message = "Successfully created FSM. "

    # CHECK IF THE LATEST CONTENT FSM IS SAME AS THE LATEST FSM STORED IN MONGO
    latest_doc = await fsm_json_mongo.find_top_one("created_at")
    if latest_doc != None:
        latest_fsm_doc = IVRfsmDoc(**latest_doc)

        if current_fsm_doc != latest_fsm_doc:
            # CURRENT FSM IS DIFFERENT, SAVE IT IN MONGO
            await fsm_json_mongo.insert(current_fsm_doc.dict(by_alias=True))
            response_message += (
                "Current FSM is different from previous FSM. Added a new FSM in mongo."
            )
        else:
            # USE SAME FSM ID AS IN LATEST FSM DOC FROM MONGO
            fsm[latest_fsm_doc.id] = updated_fsm
            del fsm[updated_fsm.fsm_id]
            state.latest_fsm_id = latest_fsm_doc.id
            # latest_fsm_id = latest_fsm_doc.id
            # fsm.fsm_id = latest_fsm_doc.id
            response_message += "Current FSM and FSM in mongo are same, skipping addition of new FSM to mongo."
    else:
        await fsm_json_mongo.insert(current_fsm_doc.dict(by_alias=True))
        response_message += "FSM collection was empty. Added a new FSM in mongo."

    response.status_code = 200
    return {"message": response_message, "status_code": response.status_code}


@app.post(
    "/call_webhook",
    summary="Triggered on receiving a missed call to start IVR",
    description=""" 
    Stores the missed call number and its status in the database and
    initiates a new IVR call from Vonage to the missed call number.
    
    This endpoint will:
    - Log the missed call in the database [state: pending]
    - Create a new call using Vonage API
    - Initialize the call state in the database
    - Log the missed call in the database [state: called]
    - Return the call details including conversation UUID
    """,
    response_model=VonageCallStartResponse,
    responses={
        200: {"description": "Call initiated successfully"},
        400: {"description": "Invalid phone number or request"},
        500: {"description": "Failed to initiate call"},
    },
)
async def call_webhook(request: Request, response: Response):
    # Get state from lifespan-managed app state
    state = get_app_state()
    calls_log_mongo = state.calls_log_mongo

    webhook_start_time = time.time()
    logging.info("[WEBHOOK] ========================================")
    logging.info(f"[WEBHOOK] Webhook received at timestamp: {webhook_start_time}")
    call_data = await request.json()
    query_params = request.query_params
    logging.info(f"[WEBHOOK] CALL DATA RECEIVED: {call_data}")
    call_status = call_data.get("_su")  # 2 = missed call
    phone_number = call_data.get("_cl")  # with country code
    tenant_id = query_params.get("tenant_id")  # optional tenant id
    logging.info(f"[WEBHOOK] CALL STATUS: {call_status}")
    if call_status != 2:
        logging.error(
            f"[WEBHOOK] Call status is not missed call (status={call_status})"
        )
        response.status_code = STATUS_BAD_REQUEST
        return {"detail": "Invalid call data received"}
    # log missed call in DB with state: pending
    insert_result = await calls_log_mongo.insert(
        {"phone_number": phone_number, "timestamp": datetime.now(), "status": "pending"}
    )
    logging.info(f"[WEBHOOK] ✓ Logged missed call with ID: {insert_result}")

    # send message to service bus to process the call asynchronously
    logging.info(
        f"[WEBHOOK] Sending message to call_webhook queue, log_id: {insert_result}"
    )
    payload = {
        "phone_number": phone_number,
        "call_log_id": str(insert_result),
        "tenant_id": tenant_id,
    }
    logging.info(f"[WEBHOOK] Payload: {payload}")
    try:
        result = await service_bus_manager.send_call_webhook(payload=payload)
        logging.info(f"[WEBHOOK] ✓ Message send result: {result}")
        if result:
            logging.info(f"[WEBHOOK] ✓✓✓ Message successfully sent to queue")
        else:
            logging.error(f"[WEBHOOK] ✗✗✗ Message send FAILED - returned False")
    except Exception as e:
        logging.error(f"[WEBHOOK] ✗✗✗ Exception sending message: {e}")
        import traceback

        traceback.print_exc()
        raise
    logging.info("[WEBHOOK] ========================================")
    response.status_code = STATUS_OK
    return {
        "status_code": response.status_code,
        "message": "Call processing initiated for phone number: " + phone_number,
    }

    # start_ivr_response = await start_ivr(response, sender=phone_number)
    # # log missed call in DB with state: called
    # if start_ivr_response.get("status_code") == STATUS_OK:
    #     await calls_log_mongo.update_document(
    #         insert_result, {"status": "called", "called_at": datetime.now()}
    #     )
    #     logging.info(f"Updated missed call log ID {insert_result} to status 'called'")
    # return start_ivr_response


@app.post(
    "/start_ivr",
    summary="Initialize a new IVR call",
    description=""" 
    Initiates a new IVR call to the specified phone number.
    
    This endpoint will:
    - Create a new call using Vonage API
    - Initialize the call state in the database
    - Return the call details including conversation UUID
    """,
    response_model=VonageCallStartResponse,
    responses={
        200: {"description": "Call initiated successfully"},
        400: {"description": "Invalid phone number or request"},
        500: {"description": "Failed to initiate call"},
    },
)
async def start_ivr(
    response: Response,
    sender: str = Form(
        ..., description="Phone number to call in E.164 format (e.g., +1234567890)"
    ),
):
    # Get state from lifespan-managed app state
    state = get_app_state()
    fsm = state.fsm
    latest_fsm_id = state.latest_fsm_id
    ongoing_fsm_mongo = state.ongoing_fsm_mongo

    try:
        raw_key = base64.b64decode(settings.vonage_application_private_key64).decode(
            "utf-8"
        )
        client = vonage.Client(
            application_id=settings.vonage_application_id,
            private_key=raw_key,
        )

        # form_data = await request.form()
        # data = dict(form_data)
        # phone_number = data.get('sender', None)

        sender_data = StartIVRFormData(sender=sender)
        phone_number = sender_data.sender

        # Extract the 'sender' value from the form data
        # if phone_number is None:
        #     response.status_code = 400
        #     return {"detail": "Sender value is required"}

        doc = await ongoing_fsm_mongo.find_one_by_query({"phone_number": phone_number})
        if doc != None:
            ivr_state = IVRCallStateMongoDoc(**doc)
            # CHECK IF LAST CALL HAPPENED STALE_WAIT_IN_SECONDS SECONDS BEFORE,
            # IF THIS IS THE CASE IT IS ASSUMED THAT THE DOC FOUND IS STALE
            # - DELETE THE DOC
            # - HANG UP THE CALL IN CASE ITS STILL UP : TODO
            if (datetime.now() - ivr_state.created_at).total_seconds() / 60 > int(
                os.environ.get("STALE_WAIT_IN_MINUTES", 60)
            ):
                await ongoing_fsm_mongo.delete(phone_number)

            # OTHERWISE DON'T ALLOW THE CALL TO BE STARTED
            else:
                logging.warning(f"doc found: {doc}")
                response.status_code = 403
                return {
                    "status_code": response.status_code,
                    "message": "IVR already running for phone number: " + phone_number,
                }

        latest_fsm = fsm[latest_fsm_id]
        ncco_actions = accumulator.combine(
            [
                action_factory.get_action_implmentation(x)
                for x in latest_fsm.get_start_fsm_actions()
            ]
        )

        # ncco_actions = accumulator.combine([action_factory.get_action_implmentation(x) for x in fsm.get_start_fsm_actions()])
        logging.info(f"NCCO: {json.dumps(ncco_actions, indent=2)}")

        vonage_resp = client.voice.create_call(
            {
                "to": [{"type": "phone", "number": phone_number}],
                "from": {"type": "phone", "number": os.getenv("VONAGE_NUMBER")},
                "ncco": ncco_actions,
                "length_timer": int(os.getenv("CALL_DURATION_LIMIT_IN_SECONDS", 300)),
            }
        )
        vonage_resp = VonageCallStartResponse(**vonage_resp)
        logging.info(f"VONAGE RESPONSE: {vonage_resp}")

        ivr_call_state = IVRCallStateMongoDoc(
            _id=vonage_resp.conversation_uuid,
            phone_number=phone_number,
            fsm_id=latest_fsm.fsm_id,
            current_state_id=latest_fsm.init_state_id,
            created_at=datetime.now(),
        )

        await ongoing_fsm_mongo.insert(ivr_call_state.dict(by_alias=True))

        response.status_code = 200
        return {
            "status_code": response.status_code,
            "message": "IVR started for phone number: " + phone_number,
        }
    except Exception as e:
        error_traceback = traceback.format_exc()
        logging.error(f"Error in start_ivr: {error_traceback}")
        response.status_code = 500
        return {
            "status_code": response.status_code,
            "error": "An error occurred while processing the request.",
            "details": error_traceback,
        }


@app.post(
    "/start_bulk_calls",
    summary="Initiate multiple IVR calls",
    description="""
    Initiates IVR calls to multiple phone numbers with specified content.
    
    This endpoint will:
    - Create a new FSM for the specified content IDs
    - Store the FSM in the database
    - Initiate calls to all provided phone numbers with a rate limit of 1 call per second
    """,
    response_model=dict,
    responses={
        200: {"description": "Bulk calls initiated successfully"},
        400: {"description": "Invalid request parameters"},
        500: {"description": "Failed to initiate bulk calls"},
    },
)
async def start_bulk_calls(request: BulkCallRequest):
    # Get state from lifespan-managed app state
    state = get_app_state()
    fsm = state.fsm
    ongoing_fsm_mongo = state.ongoing_fsm_mongo
    radio_fsm_mongo = state.radio_fsm_mongo

    try:
        phone_numbers = request.phone_numbers
        content_ids = request.content_ids
        # Step 3: Get the FSM using content IDs
        logging.info(f"Content IDs: {content_ids}, Phone numbers: {phone_numbers}")
        radio_fsm = await instantiate_from_content_ids(content_ids=content_ids)
        fsm[radio_fsm.fsm_id] = radio_fsm

        # Step 4: Store the FSM in the 'radio' collection in 'ivr' DB

        radio_fsm_doc = radio_fsm.serialize()
        with open("radio_fsm.json", "w") as f:
            f.write(json.dumps(radio_fsm_doc.dict(by_alias=True), indent=2))
        # print(json.dumps(radio_fsm_doc.dict(by_alias=True), indent=2))
        await radio_fsm_mongo.insert(radio_fsm_doc.dict(by_alias=True))

        # Step 5: Initiate calls at a rate of one per second
        count = len(phone_numbers)
        ncco_actions = accumulator.combine(
            [
                action_factory.get_action_implmentation(x)
                for x in radio_fsm.get_start_fsm_actions()
            ]
        )
        logging.info(f"NCCO: {json.dumps(ncco_actions, indent=2)}")

        for phone_number in phone_numbers:
            doc = await ongoing_fsm_mongo.find_one_by_query(
                {"phone_number": phone_number}
            )
            if doc != None:
                count -= 1
                ivr_state = IVRCallStateMongoDoc(**doc)
                # CHECK IF LAST CALL HAPPENED STALE_WAIT_IN_SECONDS SECONDS BEFORE,
                # IF THIS IS THE CASE IT IS ASSUMED THAT THE DOC FOUND IS STALE
                # - DELETE THE DOC
                # - HANG UP THE CALL IN CASE ITS STILL UP : TODO
                if (datetime.now() - ivr_state.created_at).total_seconds() > int(
                    os.environ.get("STALE_WAIT_IN_SECONDS", 60)
                ):
                    await ongoing_fsm_mongo.delete(phone_number)

                # OTHERWISE DON'T ALLOW THE CALL TO BE STARTED
                else:
                    continue
                    # response.status_code = 403
                    # return {"message": "IVR already running for phone number: " + phone_number}
            raw_key = base64.b64decode(
                settings.vonage_application_private_key64
            ).decode("utf-8")
            client = vonage.Client(
                application_id=application_id,
                private_key=raw_key,
            )
            # print("NCCO:", json.dumps(ncco_actions, indent=2))
            vonage_resp = client.voice.create_call(
                {
                    "to": [{"type": "phone", "number": phone_number}],
                    "from": {"type": "phone", "number": os.getenv("VONAGE_NUMBER")},
                    "ncco": ncco_actions,
                    "length_timer": int(
                        os.getenv("CALL_DURATION_LIMIT_IN_SECONDS", 300)
                    ),
                }
            )
            vonage_resp = VonageCallStartResponse(**vonage_resp)

            ivr_call_state = IVRCallStateMongoDoc(
                _id=vonage_resp.conversation_uuid,
                phone_number=phone_number,
                fsm_id=radio_fsm.fsm_id,
                current_state_id=radio_fsm.init_state_id,
                created_at=datetime.now(),
            )

            await ongoing_fsm_mongo.insert(ivr_call_state.dict(by_alias=True))

            logging.info(
                f"Call started with conversation UUID: {vonage_resp.conversation_uuid}"
            )

            # Sleep for one second before initiating the next call
            await asyncio.sleep(1)

        # write to bulk collection, get the user id initiating the bulk call
        # Return list of conv IDs of calls
        return {"message": f"Calls initiated for {count} phone numbers."}

    except Exception as e:
        error_traceback = traceback.format_exc()
        logging.error(f"Error in start_bulk_calls: {error_traceback}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "An error occurred while processing the request.",
                "details": error_traceback,
            },
        )


@app.get(
    "/",
    summary="Root endpoint",
    description="Health check endpoint to verify the API is running",
    responses={
        200: {"description": "API is running"},
        500: {"description": "Internal server error"},
    },
)
def read_root():
    """
    Health check endpoint.
    Returns a simple message to verify the API is running.
    """
    return {"status": "IVR v2 API is running"}


@app.get("/answer")
def get_answer():
    # talk = Ncco.Talk(text='Hello from Vonage SERVER!', bargeIn=True, loop=5, premium=True)
    # ncco = Ncco.build_ncco(record, connect, talk)
    # return ncco
    ncco = [
        {
            "action": "talk",
            "text": "Hello from Vonage Answer URL!",
            "bargeIn": True,
            "loop": 5,
        }
    ]
    return ncco


@app.post(
    "/event",
    summary="Handle call events",
    description="""
    Processes call events from Vonage asynchronously via queue.
    Handles various call status updates and forwards them to the appropriate FSM handler.
    """,
    response_model=dict,
    responses={
        200: {"description": "Event queued successfully"},
        400: {"description": "Invalid request"},
        500: {"description": "Internal server error"},
    },
)
async def get_event(req: Request, response: Response):
    try:
        req_data = await req.json()
        logging.info(f"[EVENT] Raw REQUEST Data: {req_data}")

        event_request = EventWebhookRequest(**req_data)
        logging.info(
            f"[EVENT] EVENT RECEIVED: {json.dumps(event_request.dict(by_alias=True), cls=CustomJSONEncoder, indent=2)}"
        )

        # Send event to queue for async processing
        payload = {
            "conversation_uuid": event_request.conversation_uuid,
            "status": event_request.status.value,
            "timestamp": event_request.timestamp,
            "duration": event_request.duration,
        }
        await service_bus_manager.send_call_event(payload=payload)
        logging.info(
            f"[EVENT] ✓ Event sent to queue for conversation: {event_request.conversation_uuid}"
        )

        response.status_code = 200
        return {"message": "event queued for processing"}
    except ValidationError as ve:
        error_traceback = traceback.format_exc()
        logging.error(f"Validation error: {ve.errors()}")
        logging.error(f"Request data causing the error: {req_data}")
        logging.error(error_traceback)
        response.status_code = 422
        return {
            "error": "Validation error occurred while processing the request.",
            "details": ve.errors(),
        }
    except Exception as e:
        error_traceback = traceback.format_exc()
        logging.error(error_traceback)
        response.status_code = 500
        return {
            "error": "An error occurred while processing the request.",
            "details": error_traceback,
        }


@app.post(
    "/webhooks/conversationevents",
    summary="Handle conversation events",
    description="""
    Handles incoming RTC webhook requests related to conversation events, specifically audio play events.
    It updates IVR state documents in MongoDB based on the type of audio event received.
    
    - For 'audio:play' events: Checks if the current state has a stream action configured
      with record playback set to true and a matching stream URL.
    - For 'audio:play:stop' and 'audio:play:done' events: Updates the corresponding timestamps
      for the playback information.
    """,
    response_model=dict,
    responses={
        200: {"description": "Event processed successfully"},
        400: {"description": "Invalid request"},
        500: {"description": "Internal server error"},
    },
)
async def get_conv_event(req: ConversationRTCWebhookRequest):
    """
    Handles incoming RTC webhook requests related to conversation events, specifically audio play events.
    It updates IVR state documents in mongo, based on the type of audio event received.

    For an 'audio:play' event:
    - Checks if the current state of the conversation in the database, has a stream action configured
      with record playback set to true and a stream URL that matches the one received in the event payload.
    - If a match is found, a new entry of type `StreamPlaybackInfo` is appended in the `stream_playback`
      attribute of IVR state document

    For 'audio:play:stop' and 'audio:play:done' events:
    - Checks the play ID provided in the event against the IVR state document.
    - Updates the corresponding 'stoppedAt' and 'doneAt' timestamps for the playback information in the document.
    """
    # Get state from lifespan-managed app state
    state = get_app_state()
    fsm = state.fsm
    ongoing_fsm_mongo = state.ongoing_fsm_mongo

    if (
        req.type == ConversationRTCEventType.AUDIO_PLAY
        and "stream_url" in req.body
        and "play_id" in req.body
    ):
        doc = await ongoing_fsm_mongo.find_by_id(req.conversation_id)
        if doc is not None:
            ivr_state = IVRCallStateMongoDoc(**doc)
            fsm_in_progress = fsm[ivr_state.fsm_id]
            current_state = fsm_in_progress.get_state(ivr_state.current_state_id)
            req_stream_url = req.body["stream_url"][0]
            if current_state is not None:
                stream_actions = (
                    current_state.get_stream_action_with_record_playback_option()
                )
                for action in stream_actions:
                    # IGNORE THE SAS PART OF THE stream URL
                    if req_stream_url.startswith(action.url):
                        logging.info(
                            f"Stream action matched: {json.dumps(req.dict(by_alias=True), indent=2, cls=CustomJSONEncoder)}"
                        )
                        ivr_state.stream_playback.append(
                            StreamPlaybackInfo(
                                play_id=req.body["play_id"],
                                stream_url=action.url,
                                started_at=req.timestamp,
                            )
                        )
                        await ongoing_fsm_mongo.update_document(
                            ivr_state.id, ivr_state.dict(by_alias=True)
                        )
    elif req.type == ConversationRTCEventType.AUDIO_PLAY_STOP and "play_id" in req.body:
        doc = await ongoing_fsm_mongo.find_by_id(req.conversation_id)
        if doc is not None:
            ivr_state = IVRCallStateMongoDoc(**doc)
            req_play_id = req.body["play_id"]
            should_update = False
            for playback_info in ivr_state.stream_playback:
                if playback_info.play_id == req_play_id:
                    logging.info(
                        f"Playback stopped: {json.dumps(req.dict(by_alias=True), indent=2, cls=CustomJSONEncoder)}"
                    )
                    playback_info.stopped_at = req.timestamp
                    should_update = True
                    break
            if should_update:
                await ongoing_fsm_mongo.update_document(
                    ivr_state.id, ivr_state.dict(by_alias=True)
                )
    elif req.type == ConversationRTCEventType.AUDIO_PLAY_DONE and "play_id" in req.body:
        doc = await ongoing_fsm_mongo.find_by_id(req.conversation_id)
        if doc is not None:
            ivr_state = IVRCallStateMongoDoc(**doc)
            req_play_id = req.body["play_id"]
            should_update = False
            for playback_info in ivr_state.stream_playback:
                if playback_info.play_id == req_play_id:
                    logging.info(
                        f"Playback done: {json.dumps(req.dict(by_alias=True), indent=2, cls=CustomJSONEncoder)}"
                    )
                    playback_info.done_at = req.timestamp
                    should_update = True
                    break
            if should_update:
                await ongoing_fsm_mongo.update_document(
                    ivr_state.id, ivr_state.dict(by_alias=True)
                )
    return {"message": "recorded"}


@app.post(
    "/input",
    summary="Process DTMF input",
    description="""
    Processes DTMF (Dual-Tone Multi-Frequency) input from a call.
    
    This endpoint handles the user's keypad input during an active call
    and routes to the appropriate IVR state based on the input.
    
    The endpoint expects a JSON payload with the following structure:
    - dtmf: Object containing the digits pressed
    - conversation_uuid: Unique identifier for the call
    
    Returns an NCCO (Nexmo Call Control Object) response to control the call flow.
    """,
    response_model=dict,
    responses={
        200: {"description": "DTMF processed successfully and NCCO response generated"},
        400: {"description": "Invalid input format"},
        404: {"description": "Call session not found"},
        500: {"description": "Error processing DTMF input"},
    },
)
async def dtmf(input: Request):
    # Get state from lifespan-managed app state
    state = get_app_state()
    fsm = state.fsm
    ongoing_fsm_mongo = state.ongoing_fsm_mongo

    input_data = await input.json()
    logging.info(f"INPUT DATA RAW: {input_data}")
    dtmf_input = DTMFInput(**input_data)

    # Process DTMF input synchronously to return NCCO immediately
    logging.info(f"Received request body: {dtmf_input}")
    digits = dtmf_input.dtmf.digits
    conv_id = dtmf_input.conversation_uuid
    # Retry logic to handle race condition where DTMF arrives before state is created
    doc = None
    max_retries = 3
    retry_delay = 0.5  # seconds - shorter delay for DTMF input

    for attempt in range(max_retries):
        doc = await ongoing_fsm_mongo.find_by_id(conv_id)
        if doc is not None:
            break

        if attempt < max_retries - 1:
            logging.debug(
                f"IVR state not found for {conv_id}, attempt {attempt + 1}/{max_retries}, waiting {retry_delay}s..."
            )
            await asyncio.sleep(retry_delay)

    if doc == None:
        logging.info(
            f"INFO: NO ONGOING IVR STATE FOUND FOR CONV ID: {conv_id} after {max_retries} retries"
        )
        # Return terminal NCCO to disconnect the call when IVR state is missing
        ncco = accumulator.combine(
            [
                action_factory.get_action_implmentation(x)
                for x in [
                    TalkAction(text="Server error. Please try again later. Bye bye.")
                ]
            ]
        )
        ncco.append({"action": "hangup"})
        return JSONResponse(ncco)

    ivr_state = IVRCallStateMongoDoc(**doc)

    fsm_in_progress = fsm[ivr_state.fsm_id]
    logging.debug(f"IS FSM IN PROGRESS NONE: {fsm_in_progress == None}")
    # PROCESS MULTIPLE USER INPUTS
    input_time = datetime.now()
    logging.info(f"CURRENT STATE ID: {ivr_state.current_state_id}")
    logging.info(f"INPUT DIGITS: {digits}")
    next_actions, next_state_id = None, None

    if digits == "":
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

    await ongoing_fsm_mongo.update_document(ivr_state.id, ivr_state.dict(by_alias=True))

    start = time.time()
    ncco = accumulator.combine(
        [action_factory.get_action_implmentation(x) for x in next_actions]
    )
    logging.info(f"TIME TAKEN TO CREATE NCCO: {time.time() - start}")
    logging.info(f"NCCO RETURNED FROM INPUT API: {json.dumps(ncco, indent=2)}")
    return JSONResponse(ncco)
    # print(f"Received request body: {input}")
    # digits = input.dtmf.digits
    # conv_id = input.conversation_uuid
    # doc = await ongoing_fsm_mongo.find_by_id(conv_id)
    # if doc == None:
    #     print("ERROR: NO ONGOING IVR STATE FOUND FOR CONV ID: ", conv_id)
    #     # Talk Action of server error bye bye
    #     # internal_server_action = ask Kavyansh if it's fine to import TalkAction here
    #     ncco = accumulator.combine(
    #         [
    #             action_factory.get_action_implmentation(x)
    #             for x in [
    #                 TalkAction(text="Server error. Please try again later. Bye bye.")
    #             ]
    #         ]
    #     )
    #     return JSONResponse(ncco)
    #
    # ivr_state = IVRCallStateMongoDoc(**doc)
    #
    # fsm_in_progress = fsm[ivr_state.fsm_id]
    # print("iS FSM IN PROGRESS NONE", fsm_in_progress == None)
    # # PROCESS MULTIPLE USER INPUTS
    # input_time = datetime.now()
    # print("CURRENT STATE ID", ivr_state.current_state_id)
    # print("INPUT DIGITS", digits)
    # next_actions, next_state_id = None, None
    # for digit in digits:
    #     pre_state_id = ivr_state.current_state_id
    #     next_actions, next_state_id = await fsm_in_progress.get_next_actions(
    #         digit, ivr_state
    #     )
    #     ivr_state.current_state_id = next_state_id
    #     ivr_state.user_actions.append(
    #         UserAction(
    #             key_pressed=digit,
    #             timestamp=input_time,
    #             pre_state_id=pre_state_id,
    #             post_state_id=next_state_id,
    #         )
    #     )
    #
    # if digits == "":
    #     pre_state_id = ivr_state.current_state_id
    #     next_actions, next_state_id = await fsm_in_progress.get_next_actions(
    #         "", ivr_state
    #     )
    #     ivr_state.current_state_id = next_state_id
    #     ivr_state.user_actions.append(
    #         UserAction(
    #             key_pressed="empty",
    #             timestamp=input_time,
    #             pre_state_id=pre_state_id,
    #             post_state_id=next_state_id,
    #         )
    #     )
    #
    # await ongoing_fsm_mongo.update_document(ivr_state.id, ivr_state.dict(by_alias=True))
    # start = time.time()
    # ncco = accumulator.combine(
    #     [action_factory.get_action_implmentation(x) for x in next_actions]
    # )
    # print("TIME TAKEN TO CREATE NCCO ", time.time() - start)
    # print("NCCO RETURNED FROM INPUT API: ", json.dumps(ncco, indent=2))
    # return JSONResponse(ncco)


@app.post(
    "/fallback",
    summary="Fallback endpoint",
    description="""
    Fallback endpoint for handling undefined routes or invalid requests.
    
    This endpoint catches any POST requests that don't match other routes.
    It's primarily used as a safety net for malformed requests.
    """,
    responses={200: {"description": "Default response for unmatched routes"}},
)
def get_answer():
    """
    Returns a simple response for unmatched routes.

    This is a catch-all endpoint that returns a basic response when no other
    route matches the incoming request.
    """
    return {"hello": "world"}
