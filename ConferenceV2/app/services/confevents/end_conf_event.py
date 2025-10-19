from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.singletons.websocket_service import WebsocketService

class EndConferenceEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call

    async def execute_event(self):
        self.conf_call.state.is_running = False
        await self.conf_call.communication_api.end_conf()
        
        self.conf_call.state.action_history.append(ActionHistory(
                                                    timestamp= datetime.now().isoformat(), 
                                                    action_type=ActionType.CONFERENCE_END, 
                                                    metadata={}, 
                                                    # TODO: OWNER OF THIS CAN BE SYSTEM or TEACHER
                                                    owner=self.conf_call.state.teacher_phone_number
                                                 )
                                    )
        # self.event_queue_processing_task.cancel() # Not ending processing tasks because call disconnect status events will be received from vonage
        # await self.conf_call.websocket_service.close_websocket()
        
        ws = WebsocketService()
        await ws.send_message(WebsocketServiceMessage(
                                websocket_id=self.conf_call.conf_id,
                                type=MessageType.DISCONNECT,
                            ))
        # Log the action in the action history
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.CONFERENCE_END,
                metadata={},
                owner=self.conf_call.state.teacher_phone_number
            )
        )
        await self.conf_call.update_state()
