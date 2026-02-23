# routers/conference.py

from fastapi import APIRouter, HTTPException, Query
from app.services.conference_call import ConferenceCall
from app.services.confevents.resume_content_event import ResumeContentEvent
from app.services.singletons.conference_call_manager import conference_manager
from app.services.confevents.add_participant_event import AddParticipantEvent
from app.services.confevents.end_conf_event import EndConferenceEvent
from app.services.confevents.mute_participant_event import MuteParticipantEvent
from app.services.confevents.mute_all_event import MuteAllEvent
from app.services.confevents.pause_content_event import PauseContentEvent
from app.services.confevents.play_content_event import PlayContentEvent
from app.services.confevents.remove_participant_event import RemoveParticipantEvent
from app.services.confevents.seek_content_event import SeekContentEvent
from app.services.confevents.sink_conf_event import SinkConferenceEvent
from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent
from app.services.confevents.unmute_all_event import UnmuteAllEvent
from app.schemas.conference_schemas import CreateConferenceRequest

router = APIRouter()

# ws_service = WebsocketService()
# settings = get_settings()

# Initialize services
# storage_manager = CosmosDBStorage(
#     endpoint=settings.COSMOS_ENDPOINT,
#     key=settings.COSMOS_KEY,
#     database_name=settings.COSMOS_DATABASE,
#     container_name=settings.COSMOS_CONTAINER,
# )


@router.post("/test-createstart")
async def create_start_conference(request: CreateConferenceRequest):
    conference_call = conference_manager.create_conference(
        request.teacher_phone, request.student_phones
    )
    await conference_manager.start_conference_call(conference_call.conf_id)
    return {"status": "STARTED", "id": conference_call.conf_id}


@router.post("/create")
async def create_conference(request: CreateConferenceRequest):
    conference_call = conference_manager.create_conference(
        request.teacher_phone, request.student_phones
    )
    return {"status": "CREATED", "id": conference_call.conf_id}


@router.post("/start/{conference_id}")
async def start_conference(conference_id: str):
    await conference_manager.start_conference_call(conference_id)
    return {"status": "STARTED", "id": conference_id}


@router.get("/teacherappconnect/{conference_id}")
async def connect_smartphone(conference_id: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    return await conference.connect_smartphone()


@router.post("/teacherappdisconnect/{conference_id}")
async def disconnect_smartphone(conference_id: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    return await conference.disconnect_smartphone()


@router.put("/end/{conference_id}")
async def end_conference(conference_id: str):
    conference: ConferenceCall = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(EndConferenceEvent(conf_call=conference))
    return {"message": "Event Queued for execution"}


@router.put("/sink/{conference_id}")
async def sink_conference(conference_id: str):
    conference: ConferenceCall = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(
        SinkConferenceEvent(
            conf_call=conference,
            on_sink_callback=lambda: conference_manager.delete_conference(
                conference_id
            ),
        )
    )
    return {"message": "Event Queued for execution"}


@router.put("/addparticipant/{conference_id}")
async def add_participant(conference_id: str, phone_number: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(
        AddParticipantEvent(phone_number=phone_number, conf_call=conference)
    )
    return {"message": "Event Queued for execution"}


@router.put("/removeparticipant/{conference_id}")
async def remove_participant(conference_id: str, phone_number: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(
        RemoveParticipantEvent(phone_number=phone_number, conf_call=conference)
    )
    return {"message": "Event Queued for execution"}


@router.put("/muteparticipant/{conference_id}")
async def mute_participant(conference_id: str, phone_number: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(
        MuteParticipantEvent(phone_number=phone_number, conf_call=conference)
    )
    return {"message": "Event Queued for execution"}


@router.put("/unmuteparticipant/{conference_id}")
async def unmute_participant(conference_id: str, phone_number: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(
        UnmuteParticipantEvent(phone_number=phone_number, conf_call=conference)
    )
    return {"message": "Event Queued for execution"}


@router.put("/muteall/{conference_id}")
async def mute_all(conference_id: str):
    """
    Mute all student participants in the conference.
    Only teachers can perform this action.
    Only applies to students, not the teacher.
    """
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    
    # Verify that the conference has a teacher (authorization check)
    teacher = conference.state.get_teacher()
    if not teacher:
        raise HTTPException(status_code=403, detail="Only teachers can mute all participants")
    
    await conference.queue_event(
        MuteAllEvent(conf_call=conference)
    )
    return {"message": "Event Queued for execution"}


@router.put("/unmuteall/{conference_id}")
async def unmute_all(conference_id: str):
    """
    Unmute all student participants in the conference.
    Only teachers can perform this action.
    Only applies to students, not the teacher.
    """
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    
    # Verify that the conference has a teacher (authorization check)
    teacher = conference.state.get_teacher()
    if not teacher:
        raise HTTPException(status_code=403, detail="Only teachers can unmute all participants")
    
    await conference.queue_event(
        UnmuteAllEvent(conf_call=conference)
    )
    return {"message": "Event Queued for execution"}


@router.put("/playaudio/{conference_id}")
async def play_audio(conference_id: str, url: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(PlayContentEvent(conf_call=conference, url=url))
    return {"message": "Event Queued for execution"}


@router.put("/pauseaudio/{conference_id}")
async def pause_audio(conference_id: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(PauseContentEvent(conf_call=conference))
    return {"message": "Event Queued for execution"}


@router.put("/resumeaudio/{conference_id}")
async def resume_audio(conference_id: str):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(ResumeContentEvent(conf_call=conference))
    return {"message": "Event Queued for execution"}


@router.put("/seekaudio/{conference_id}")
async def seek_audio(
    conference_id: str,
    delta_seconds: int = Query(
        ...,
        description="Signed seek offset in seconds (negative rewinds, positive fast-forwards)",
    ),
):
    conference = conference_manager.get_conference(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    await conference.queue_event(
        SeekContentEvent(conf_call=conference, delta_seconds=delta_seconds)
    )
    return {"message": "Event Queued for execution"}
