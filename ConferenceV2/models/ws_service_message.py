from enum import Enum
import os
from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator, FieldValidationInfo

from models.audio_content_state import ContentStatus

load_dotenv()

blob_store_name = os.getenv("STORAGE_ACCOUNT_NAME")
if not blob_store_name:
    raise ValueError("STORAGE_ACCOUNT_NAME environment variable is not set.")

class MessageType(str, Enum):
    HEARTBEAT = "ping"
    PLAY_AUDIO = "play"
    PAUSE_AUDIO = "pause"
    RESUME_AUDIO = "resume"
    STOP_AUDIO = "stop"
    PLAYBACK_STATE_UPDATES = "playback-state-update"
    DISCONNECT = "disconnect"
    RECONNECT = "reconnect"

class SystemAudioMessages(str, Enum):
    # Hi, Welcome to SEEDS. Connecting you to the conference call.
    WELCOME_TEACHER = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/teacher_welcome_message.mp3"
    
    # Welcome! You are on mute, press 0 when you want to talk.
    WELCOME_STUDENT = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/student_welcome_message.mp3"
    
    # Teacher has joined
    TEACHER_HAS_JOINED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/teacher_has_joined.mp3"
    
    # Student has joined
    STUDENT_HAS_JOINED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/student_has_joined.mp3"
    
    # Student has raised hand
    STUDENT_HAS_RAISED_HAND = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/student_has_raised_hand.mp3"
    
    # Student is muted
    STUDENT_IS_MUTED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/student_is_muted.mp3"
    
    # Student is unmuted
    STUDENT_IS_UNMUTED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/student_is_unmuted.mp3"
    
    # Teacher has dropped from the call. Please wait for them to join
    TEACHER_HAS_DROPPED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/teacher_has_dropped_from_call.mp3"
    
    # Student has dropped from the call.
    STUDENT_HAS_DROPPED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessages/english/student_has_dropped_from_call.mp3"
    
class WebsocketServiceMessage(BaseModel):
    websocket_id: str
    type: MessageType
    message: str = ""
