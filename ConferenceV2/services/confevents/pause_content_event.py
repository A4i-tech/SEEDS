from datetime import datetime
from models.action_history import ActionHistory, ActionType
from models.audio_content_state import ContentStatus
from models.ws_service_message import MessageType, WebsocketServiceMessage
from services.conference_call import ConferenceCall
from services.singletons.azure_service_bus_service import AzureServiceBusService
from services.singletons.websocket_service import WebsocketService


class PauseContentEvent:
    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call

    async def execute_event(self):
        audio_state = self.conf_call.state.audio_content_state
        
        # Update audio content state to paused
        # audio_state.status = ContentStatus.PAUSED
        # audio_state.paused_at = datetime.now().isoformat()
        
        # Send Pause Message to NodeJS websocket service
        # ws = WebsocketService() 
        azure_service_bus_service = AzureServiceBusService()
        await azure_service_bus_service.send_message(WebsocketServiceMessage(
            websocket_id=self.conf_call.conf_id,
            type=MessageType.PAUSE_AUDIO,
        ))
        
        # Log the action in the action history
        # TODO: Add to action history on message from websocket service or create a new action of 
        # message sent to websocket service
        # self.conf_call.state.action_history.append(
        #     ActionHistory(
        #         timestamp=datetime.now().isoformat(),
        #         action_type=ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE,
        #         metadata={
        #             "playback_status": audio_state.__dict__  # Using __dict__ to mimic model_dump
        #         },
        #         owner=self.conf_call.state.teacher_phone_number
        #     )
        # )
        
        # Update the conference call state
        # await self.conf_call.update_state()
