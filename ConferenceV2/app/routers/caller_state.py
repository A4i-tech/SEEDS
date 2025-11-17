# File: ConferenceV2/app/routers/caller_state.py

from fastapi import APIRouter, Path, Query, Response, status
from app.services.caller_state_manager import caller_state_manager

router = APIRouter(prefix="/callerstate", tags=["Caller State"])

@router.get("/{conference_id}", summary="Long poll for conference state changes")
async def long_poll_caller_state(
    response: Response,
    conference_id: str = Path(..., description="The ID of the conference to monitor."),
    known_version: int = Query(0, description="The version number of the state last known by the client."),
):
    new_state, new_version = await caller_state_manager.get_state_since_version(conference_id, known_version)
    response.headers["X-State-Version"] = str(new_version)
    if new_version == known_version:
        response.status_code = status.HTTP_204_NO_CONTENT
        return None
    return new_state