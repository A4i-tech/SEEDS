from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent
from app.models.participant import Role, Participant
from app.services.conference_call import ConferenceCall
from app.conf_logger import logger_instance
from app.services.singletons.websocket_service import WebsocketService


class DTMFInputEvent(ConferenceEvent):
    def __init__(self, phone_number: str, digit: str, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.digit = digit
        self.conf_call = conf_call

    async def execute_event(self):
        if self.phone_number in self.conf_call.state.participants:
            participant: Participant = self.conf_call.state.participants[
                self.phone_number
            ]

            # Handle hold DTMF codes - *7 to self-earmuff, *8 to self-unearmuff
            if self.digit == "7":
                logger_instance.info(
                    f"[DTMF HOLD] *7 pressed by {self.phone_number} - applying self-earmuff"
                )
                print(
                    f"\n[DTMF HOLD] 🔇 Participant {self.phone_number} pressed *7 - Self-earmuffing..."
                )

                try:
                    await self.conf_call.communication_api.earmuff_participant(
                        self.phone_number
                    )
                    print(
                        f"[DTMF HOLD] ✅ Successfully self-earmuffed {self.phone_number}\n"
                    )
                    logger_instance.info(
                        f"[DTMF HOLD] ✓ Self-earmuff successful for {self.phone_number}"
                    )
                except Exception as e:
                    print(
                        f"[DTMF HOLD] ❌ Error self-earmuffing {self.phone_number}: {e}\n"
                    )
                    logger_instance.error(
                        f"[DTMF HOLD] Error self-earmuffing {self.phone_number}: {e}"
                    )
                return

            elif self.digit == "8":
                logger_instance.info(
                    f"[DTMF HOLD] *8 pressed by {self.phone_number} - removing self-earmuff"
                )
                print(
                    f"\n[DTMF HOLD] 🔊 Participant {self.phone_number} pressed *8 - Self-unearmuffing..."
                )

                try:
                    await self.conf_call.communication_api.unearmuff_participant(
                        self.phone_number
                    )
                    print(
                        f"[DTMF HOLD] ✅ Successfully self-unearmuffed {self.phone_number}\n"
                    )
                    logger_instance.info(
                        f"[DTMF HOLD] ✓ Self-unearmuff successful for {self.phone_number}"
                    )
                except Exception as e:
                    print(
                        f"[DTMF HOLD] ❌ Error self-unearmuffing {self.phone_number}: {e}\n"
                    )
                    logger_instance.error(
                        f"[DTMF HOLD] Error self-unearmuffing {self.phone_number}: {e}"
                    )
                return

            # Flip raise hand state: if participant is a student, input is "0", and hand is not already raised
            if (
                participant.role == Role.STUDENT
                and self.digit == "0"
                and not participant.is_raised
            ):
                logger_instance.info("HANDLING DTMF INPUT EVENT", self)
                participant.is_raised = True
                participant.raised_at = int(datetime.now().timestamp())

                await self.conf_call.stream_system_message(
                    SystemAudioMessages.STUDENT_HAS_RAISED_HAND
                )

                # Append action history for the raised hand event
                self.conf_call.state.action_history.append(
                    ActionHistory(
                        timestamp=datetime.now().isoformat(),
                        action_type=ActionType.STUDENT_RAISE_HAND_STATE_CHANGE,
                        metadata={
                            "phone_number": participant.phone_number,
                            "raised_hand": participant.is_raised,
                            "raised_at": participant.raised_at,
                        },
                        owner=participant.phone_number,
                    )
                )

                # Update the conference call state
                await self.conf_call.update_state()
