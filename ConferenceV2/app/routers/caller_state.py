from fastapi import APIRouter, Path, Query, Response, status
from app.services.caller_state_manager import caller_state_manager
from app.services.singletons.conference_call_manager import conference_manager

router = APIRouter(prefix="/callerstate", tags=["Caller State"])

@router.get("/{conference_id}", summary="Long poll for conference state changes")
async def long_poll_caller_state(
    response: Response,
    conference_id: str = Path(..., description="The ID of the conference to monitor.")
):
    current_state, current_version = await caller_state_manager.get_current_state(conference_id)

    conference = conference_manager.get_conference(conference_id)
    is_running = conference.state.is_running if conference else False

    response.headers["X-State-Version"] = str(current_version)

    return {
        "is_running": is_running,
        "participants": current_state
    }
