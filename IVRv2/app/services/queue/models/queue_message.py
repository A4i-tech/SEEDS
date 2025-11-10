from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from datetime import datetime
from enum import Enum
import json

class MessageType(str, Enum):
    """Enum for message types."""
    CALL_WEBHOOK = "call_webhook"
    DTMF_INPUT = "dtmf_input"
    CALL_EVENT = "call_event"

class QueueMessage(BaseModel):
    """
    Standard message format for queue providers.
    This ensures consistency across different queue implementations.
    """
    type: MessageType = Field(..., description="Type of the message.")
    payload: Dict[str, Any] = Field(..., description="Payload of the message.")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata for the message.")
    message_id: Optional[str] = Field(None, description="Unique identifier for the message.")
    correlation_id: Optional[str] = Field(None, description="Correlation ID for tracking related messages.")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when the message was created.")
    retry_count: Optional[int] = Field(0, description="Number of times the message has been retried.")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
        }

    def to_json_string(self) -> str:
        """Convert the message to a JSON string."""
        return json.dumps(self.dict(), default=str)

    @classmethod
    def from_json_string(cls, json_string: str) -> "QueueMessage":
        """Create a QueueMessage instance from a JSON string."""
        data = json.loads(json_string)
        return cls(**data)

