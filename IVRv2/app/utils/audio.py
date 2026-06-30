from typing import List, Dict, Any
from app.settings import settings

storage_account_name = settings.storage_account_name

STORAGE_ACCOUNT_BASE_URL = f"https://{storage_account_name}.blob.core.windows.net/"
OUTPUT_CONTAINER_PATH = "output-container/"


def build_audio_url(relative_path: str) -> str:
    """
    Build full audio URL from relative path.

    Args:
        relative_path (str): Relative path of the audio file.
    Returns:
        str: Full URL to the audio file.
    """
    return f"{STORAGE_ACCOUNT_BASE_URL}{OUTPUT_CONTAINER_PATH}{relative_path}"


def hydrate_comprehension_document(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert relative audio paths in comprehension documents to full URLs.

    Args:
        docs: List of comprehension documents with relative audio paths.
    Returns:
        List of comprehension documents with full audio URLs.
    """
    return [hydrate_single_document(doc) for doc in docs]


def hydrate_single_document(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Hydrate a single comprehension document with audio URLs.

    Args:
        doc: Single comprehension document with relative audio paths.
    Returns:
        Document with full audio URLs.
    """
    if "titleAudioPath" in doc:
        doc["titleAudio"] = build_audio_url(doc["titleAudioPath"])

    if "themeAudioPath" in doc:
        doc["themeAudio"] = build_audio_url(doc["themeAudioPath"])

    for question in doc.get("questions", []):
        if "audio_path" in question["question"]:
            question["question"]["url"] = build_audio_url(
                question["question"]["audio_path"]
            )

        for option in question.get("options", []):
            if "audio_path" in option:
                option["url"] = build_audio_url(option["audio_path"])

    return doc
