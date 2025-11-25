from app.settings import settings
from app.utils.mongodb import MongoDB

# Validate storage env
storage_account_name = settings.storage_account_name
if not storage_account_name:
    raise ValueError("STORAGE_ACCOUNT_NAME environment variable is not set.")

# URL base components
storage_account_base_url = f"https://{storage_account_name}.blob.core.windows.net/"
output_container_path = "output-container/"


def build_audio_url(relative_path: str) -> str:
    """Append relative audio path to Azure blob base URL"""
    return f"{storage_account_base_url}{output_container_path}{relative_path}"


def hydrate_comprehension_document(doc: dict) -> dict:
    """Convert relative audio paths stored in DB into full URLs at runtime."""
    
    # Add high level audio fields
    if "titleAudioPath" in doc:
        doc["titleAudio"] = build_audio_url(doc["titleAudioPath"])

    if "themeAudioPath" in doc:
        doc["themeAudio"] = build_audio_url(doc["themeAudioPath"])

    # Process questions + options
    for q in doc.get("questions", []):
        if "audio_path" in q["question"]:
            q["question"]["url"] = build_audio_url(q["question"]["audio_path"])

        for opt in q.get("options", []):
            if "audio_path" in opt:
                opt["url"] = build_audio_url(opt["audio_path"])

    return doc


async def load_comprehension_structure():
    """Load and hydrate comprehension structure from MongoDB."""
    comprehension = MongoDB("comprehension")
    db_doc = await comprehension.find_all()

    if not db_doc:
        raise ValueError("Comprehension document not found in MongoDB.")
    print(f"Loaded comprehension structure from DB: {db_doc}")
    # Final structure consumed by IVR logic
    return hydrate_comprehension_document(db_doc)


# This will be None until load_comprehension_structure() is called
comprehension_structure = None
