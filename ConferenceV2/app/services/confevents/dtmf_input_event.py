from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent
from app.models.participant import Role, Participant
from app.services.conference_call import ConferenceCall
from app.conf_logger import logger_instance
from app.services.singletons.websocket_service import WebsocketService
from app.services.confevents.mute_all_event import MuteAllEvent
from app.services.confevents.unmute_all_event import UnmuteAllEvent
from app.services.confevents.pause_content_event import PauseContentEvent
from app.services.confevents.resume_content_event import ResumeContentEvent
from app.services.confevents.seek_content_event import SeekContentEvent
from app.services.confevents.set_playback_speed_event import SetPlaybackSpeedEvent
from app.models.audio_content_state import ContentStatus


class DTMFInputEvent(ConferenceEvent):
    def __init__(self, phone_number: str, digit: str, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.digit = digit
        self.conf_call = conf_call

    async def execute_event(self):
        if self.phone_number in self.conf_call.state.participants:
            participant: Participant = self.conf_call.state.participants[self.phone_number]

            leader_phone = self.conf_call.state.leader_phone_number

            # Flip raise hand state: if participant is a student, input is "0", and hand is not already raised
            if participant.role == Role.STUDENT and self.digit == "0" and not participant.is_raised:
                logger_instance.info("HANDLING DTMF INPUT EVENT", self)
                participant.is_raised = True
                participant.raised_at = int(datetime.now().timestamp())

                await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_HAS_RAISED_HAND)

                # Append action history for the raised hand event
                self.conf_call.state.action_history.append(ActionHistory(
                    timestamp=datetime.now().isoformat(),
                    action_type=ActionType.STUDENT_RAISE_HAND_STATE_CHANGE,
                    metadata={
                        "phone_number": participant.phone_number,
                        "raised_hand": participant.is_raised,
                        "raised_at": participant.raised_at
                    },
                    owner=participant.phone_number
                ))

                # Update the conference call state
                await self.conf_call.update_state()

            # Leader DTMF: "1" → mute all, "3" → unmute all
            elif leader_phone and self.phone_number == leader_phone:
                if self.digit == "1":
                    await MuteAllEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
                elif self.digit == "3":
                    await UnmuteAllEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
                elif self.digit == "6":
                    # Toggle play/pause for streaming content
                    audio_state = self.conf_call.state.audio_content_state
                    if audio_state.status in (ContentStatus.PLAYING, ContentStatus.STARTING):
                        await PauseContentEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
                    else:
                        await ResumeContentEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
                elif self.digit == "7":
                    # Seek content back 10 seconds
                    await SeekContentEvent(conf_call=self.conf_call, delta_seconds=-10, initiator_phone=self.phone_number).execute_event()
                elif self.digit == "9":
                    # Seek content forward 10 seconds
                    await SeekContentEvent(conf_call=self.conf_call, delta_seconds=10, initiator_phone=self.phone_number).execute_event()
                elif self.digit == "*":
                    # Decrease playback speed by 0.25 (min 0.5)
                    current_speed = self.conf_call.state.audio_content_state.speed
                    new_speed = max(0.5, round(current_speed - 0.25, 2))
                    await SetPlaybackSpeedEvent(conf_call=self.conf_call, speed=new_speed, initiator_phone=self.phone_number).execute_event()
                elif self.digit == "#":
                    # Increase playback speed by 0.25 (max 2.0)
                    current_speed = self.conf_call.state.audio_content_state.speed
                    new_speed = min(2.0, round(current_speed + 0.25, 2))
                    await SetPlaybackSpeedEvent(conf_call=self.conf_call, speed=new_speed, initiator_phone=self.phone_number).execute_event()
