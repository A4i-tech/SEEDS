"""
Vonage Connect Action for WebSocket-based audio streaming.

This action enables real-time audio streaming via WebSocket connection,
supporting features like playback speed control, pause/resume, and position tracking.
"""

from typing import Optional
from app.base_classes.action import Action


class VonageConnectAction(Action):
    """
    VonageConnectAction establishes a WebSocket connection for audio streaming.

    This action connects the call to a WebSocket endpoint that streams audio in real-time,
    enabling advanced playback controls (speed, pause/resume, position tracking).

    Attributes:
        websocket_uri (str): WebSocket URI to connect to (must start with ws:// or wss://)
        content_type (str): Audio content type (e.g., "audio/l16;rate=8000")
        headers (dict, optional): Custom headers to send with the WebSocket connection
    """

    def __init__(
        self,
        websocket_uri: str,
        content_type: str = "audio/l16;rate=8000",
        headers: Optional[dict] = None,
    ):
        """
        Initialize VonageConnectAction.

        Args:
            websocket_uri: WebSocket URI for audio streaming
            content_type: Audio MIME type (default: "audio/l16;rate=8000" for 16-bit PCM, 8kHz)
            headers: Optional custom headers for WebSocket connection
        """
        self.websocket_uri = websocket_uri
        self.content_type = content_type
        self.headers = headers or {}

    def get(self, sas_gen_obj):
        """
        Generate Vonage NCCO connect action.

        Args:
            sas_gen_obj: SAS generator object (not used for WebSocket URIs)

        Returns:
            dict: Vonage NCCO connect action configuration
        """
        action = {
            "action": "connect",
            "endpoint": [
                {
                    "type": "websocket",
                    "uri": self.websocket_uri,
                    "content-type": self.content_type,
                }
            ],
        }

        # Add custom headers if provided
        if self.headers:
            action["endpoint"][0]["headers"] = self.headers

        return action

    def __str__(self):
        return f"VonageConnectAction: {self.websocket_uri} {self.headers}"
