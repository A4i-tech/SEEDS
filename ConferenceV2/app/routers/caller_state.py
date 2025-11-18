from fastapi import APIRouter, Path, Query, Response, status
from app.services.caller_state_manager import caller_state_manager

router = APIRouter(prefix="/callerstate", tags=["Caller State"])

@router.get("/{conference_id}", summary="Long poll for conference state changes")
async def long_poll_caller_state(
    response: Response,
    conference_id: str = Path(..., description="The ID of the conference to monitor.")
):
    current_state, current_version = await caller_state_manager.get_current_state(conference_id)
    
    response.headers["X-State-Version"] = str(current_version)
    return current_state
