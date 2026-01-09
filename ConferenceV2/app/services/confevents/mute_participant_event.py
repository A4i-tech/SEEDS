from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance
from app.services.caller_state_manager import caller_state_manager
import asyncio
from typing import Optional


class MuteParticipantEvent(ConferenceEvent):
    def __init__(
        self,
        phone_number: str,
        conf_call: ConferenceCall,
        stream_system_message: bool = True,
        max_retries: int = 3,
        initial_delay: float = 1.0
    ):
        self.phone_number = phone_number
        self.conf_call = conf_call
        self.stream_system_message = stream_system_message
        self.max_retries = max_retries
        self.initial_delay = initial_delay

    async def execute_event(self):
        if self.phone_number not in self.conf_call.state.participants:
            logger_instance.warning(f"Participant {self.phone_number} not in conference state, skipping mute")
            return

        logger_instance.info(f"EXECUTING MUTE PARTICIPANT EVENT for {self.phone_number}")

        # Attempt mute with exponential backoff retry logic
        for attempt in range(self.max_retries):
            try:
                # Update state in MongoDB (AWAIT this time - no fire-and-forget)
                await caller_state_manager.update_state(
                    conference_id=self.conf_call.conf_id,
                    participant_id=self.phone_number,
                    new_state={"muted": True}
                )

                # Mute the participant using communication API
                await self.conf_call.communication_api.mute_participant(self.phone_number)

                # Update the participant's muted status in local state
                self.conf_call.state.participants[self.phone_number].is_muted = True

                # Success! Log and continue
                logger_instance.info(f"Successfully muted participant {self.phone_number} on attempt {attempt + 1}/{self.max_retries}")

                # Stream system message if needed
                if self.stream_system_message and self.phone_number != self.conf_call.state.get_teacher().phone_number:
                    await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_IS_MUTED)

                # Log the action in the action history
                self.conf_call.state.action_history.append(
                    ActionHistory(
                        timestamp=datetime.now().isoformat(),
                        action_type=ActionType.TEACHER_MUTE_UNMUTE_STUDENT,
                        metadata={
                            "phone_number": self.phone_number,
                            "is_muted": True,
                            "retry_attempt": attempt + 1
                        },
                        owner=self.conf_call.state.teacher_phone_number
                    )
                )

                # Update the conference call state
                await self.conf_call.update_state()

                # Success - exit retry loop
                return

            except ValueError as e:
                # Participant not in map - wait and retry
                logger_instance.warning(
                    f"Attempt {attempt + 1}/{self.max_retries} to mute {self.phone_number} failed: {e}"
                )
                if attempt < self.max_retries - 1:
                    delay = self.initial_delay * (2 ** attempt)  # Exponential backoff: 1s, 2s, 4s
                    logger_instance.info(f"Retrying mute for {self.phone_number} in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    logger_instance.error(
                        f"Failed to mute {self.phone_number} after {self.max_retries} attempts. "
                        f"Participant may not be properly connected to conference."
                    )
                    raise

            except Exception as e:
                # Unexpected error - log and retry
                logger_instance.error(
                    f"Unexpected error muting {self.phone_number} on attempt {attempt + 1}/{self.max_retries}: {e}",
                    exc_info=True
                )
                if attempt < self.max_retries - 1:
                    delay = self.initial_delay * (2 ** attempt)
                    logger_instance.info(f"Retrying mute for {self.phone_number} in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    logger_instance.error(
                        f"Failed to mute {self.phone_number} after {self.max_retries} attempts due to errors"
                    )
                    raise
