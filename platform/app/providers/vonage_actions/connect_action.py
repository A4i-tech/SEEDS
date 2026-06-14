"""VonageConnectAction — WebSocket-based audio streaming connect action.

Ported from IVRv2/app/actions/vonage_actions/vonage_connect_action.py.
"""

from __future__ import annotations

from typing import Optional

from app.providers.vonage_actions.base.action import Action


class VonageConnectAction(Action):
    """Establishes a WebSocket connection for real-time audio streaming.

    Supports speed control, pause/resume, and position tracking via
    the WebSocket service.
    """

    def __init__(
        self,
        websocket_uri: str,
        content_type: str = "audio/l16;rate=8000",
        headers: Optional[dict] = None,
    ) -> None:
        self.websocket_uri = websocket_uri
        self.content_type = content_type
        self.headers = headers or {}

    def get(self, sas_gen_obj) -> dict:  # type: ignore[no-untyped-def]
        action: dict = {
            "action": "connect",
            "endpoint": [
                {
                    "type": "websocket",
                    "uri": self.websocket_uri,
                    "content-type": self.content_type,
                }
            ],
        }
        if self.headers:
            action["endpoint"][0]["headers"] = self.headers
        return action

    def __str__(self) -> str:
        return f"VonageConnectAction: {self.websocket_uri} {self.headers}"
