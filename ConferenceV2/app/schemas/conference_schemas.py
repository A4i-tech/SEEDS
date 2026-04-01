# schemas/conference_schemas.py

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator
from typing import ClassVar, List, Optional

load_dotenv()


class CreateConferenceRequest(BaseModel):
    teacher_phone: str
    teacher_name: Optional[str] = None
    student_phones: List[str]
    student_names: Optional[List[Optional[str]]] = None
    leader_phone: Optional[str] = None


class SeekAudioRequest(BaseModel):
    MAX_DELTA_SECONDS: ClassVar[int] = 600

    delta_seconds: int = Field(
        ...,
        description="Signed seek offset in seconds (negative rewinds, positive fast-forwards)",
    )

    @field_validator("delta_seconds")
    @classmethod
    def validate_delta(cls, value: int) -> int:
        min_delta = -cls.MAX_DELTA_SECONDS
        max_delta = cls.MAX_DELTA_SECONDS
        if value < min_delta or value > max_delta:
            raise ValueError(
                f"delta_seconds must be between {min_delta} and {max_delta} seconds"
            )
        return value
