from enum import Enum
import os
from dotenv import load_dotenv

load_dotenv()

# Check if Azure Storage is enabled
azure_storage_enabled = os.getenv("AZURE_STORAGE_ENABLED", "true").lower() == "true"
blob_store_name = os.getenv("STORAGE_ACCOUNT_NAME")

# Fallback URLs for local development (publicly accessible audio files)
# Using Google Cloud Storage for reliable audio samples
FALLBACK_BASE_URL = "http://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets"

if azure_storage_enabled and blob_store_name and blob_store_name != "Account_Name":
    # Use Azure Blob Storage URLs
    base_url = f"https://{blob_store_name}.blob.core.windows.net/conference/conferenceMessagesWav/english"
else:
    # Use fallback URLs for local development
    base_url = FALLBACK_BASE_URL

class SystemAudioMessages(str, Enum):
    # Hi, Welcome to SEEDS. Connecting you to the conference call.
    WELCOME_TEACHER = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/teacher_welcome_message.wav"
    
    # Welcome! You are on mute, press 0 when you want to talk.
    WELCOME_STUDENT = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/student_welcome_message.wav"
    
    # Teacher has joined
    TEACHER_HAS_JOINED = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/teacher_has_joined.wav"
    
    # Student has joined
    STUDENT_HAS_JOINED = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/student_has_joined.wav"
    
    # Student has raised hand
    STUDENT_HAS_RAISED_HAND = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/student_has_raised_hand.wav"
    
    # Student is muted
    STUDENT_IS_MUTED = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/student_is_muted.wav"
    
    # Student is unmuted
    STUDENT_IS_UNMUTED = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/student_is_unmuted.wav"
    
    # Teacher has dropped from the call. Please wait for them to join
    TEACHER_HAS_DROPPED = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/teacher_has_dropped_from_call.wav"
    
    # Student has dropped from the call.
    STUDENT_HAS_DROPPED = f"{base_url}/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3" if not azure_storage_enabled else f"{base_url}/student_has_dropped_from_call.wav"