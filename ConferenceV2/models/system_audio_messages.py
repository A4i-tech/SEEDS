from enum import Enum
import os
from dotenv import load_dotenv

load_dotenv()

blob_store_name = os.getenv("STORAGE_ACCOUNT_NAME")
if not blob_store_name:
    raise ValueError("STORAGE_ACCOUNT_NAME environment variable is not set.")

class SystemAudioMessages(str, Enum):
    # Hi, Welcome to SEEDS. Connecting you to the conference call.
    WELCOME_TEACHER = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/teacher_welcome_message.wav"
    
    # Welcome! You are on mute, press 0 when you want to talk.
    WELCOME_STUDENT = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/student_welcome_message.wav"
    
    # Teacher has joined
    TEACHER_HAS_JOINED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/teacher_has_joined.wav"
    
    # Student has joined
    STUDENT_HAS_JOINED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/student_has_joined.wav"
    
    # Student has raised hand
    STUDENT_HAS_RAISED_HAND = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/student_has_raised_hand.wav"
    
    # Student is muted
    STUDENT_IS_MUTED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/student_is_muted.wav"
    
    # Student is unmuted
    STUDENT_IS_UNMUTED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/student_is_unmuted.wav"
    
    # Teacher has dropped from the call. Please wait for them to join
    TEACHER_HAS_DROPPED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/teacher_has_dropped_from_call.wav"
    
    # Student has dropped from the call.
    STUDENT_HAS_DROPPED = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english/student_has_dropped_from_call.wav"