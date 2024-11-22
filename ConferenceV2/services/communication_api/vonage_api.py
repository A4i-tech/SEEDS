import asyncio
import os
from models.system_audio_messages import SystemAudioMessages
from services.communication_api import CommunicationAPI
from typing import Any, Dict, List, Optional
import json
from dotenv import load_dotenv
import vonage
from typing import Dict
from pydantic import BaseModel
from conf_logger import logger_instance
from services.singletons.sas_gen import sas_gen

class VonageParticipantInfo(BaseModel):
    phone_number: str
    call_leg_id: str
    initial_conv_id: str
    conference_conv_id: str = None

load_dotenv()

class VonageAPI(CommunicationAPI):
    def __init__(self, application_id: str, private_key_path: str, vonage_number: str, conf_id: str, ws_server_url: str = ""):
        self.ws_server_url = ws_server_url
        self.events_webhook_url = os.environ.get("EVENTS_WEBHOOK_EP", "")
        self.application_id = application_id
        self.private_key_path = private_key_path
        self.vonage_number = vonage_number
        self.conf_id = conf_id
        self.client = vonage.Client(application_id=self.application_id, private_key=self.private_key_path)
        self.participant_info_map: Dict[str, VonageParticipantInfo] = {}
        self.teacher_phone_number = None
        self.is_websocket_connected = False
    
    async def _try_connecting_websocket_with_participant(self, participant: VonageParticipantInfo):
        """
        Connecting websocket to this conference call, requires an active call leg. 
        The user with active call leg is transferred into a new NCCO which first connects a websocket to the user's call leg
        and then transfers both - user's call leg and the websocket, back into the conference
        
        Returns True if the above process happened for the given participant
        """
        call = self.client.voice.get_call(uuid=participant.call_leg_id)
        if call['status'] == 'answered':
            logger_instance.info('CONNECTING WEBSOCKET TO THE CONFERENCE ', self.conf_id, 'USING NUMBER', participant.phone_number, 'URL:', self.ws_server_url)
            self.client.voice.update_call(uuid=participant.call_leg_id, 
                                                    params={
                                                        "action": "transfer",
                                                        "destination": {
                                                            "type": "ncco",
                                                            "ncco": [
                                                                # {
                                                                #     "action": "talk",
                                                                #     "text": "Connecting websocket"
                                                                # },
                                                                {
                                                                    "action": "connect",
                                                                    "from": "SEEDS-ConfV2",
                                                                    "endpoint": [
                                                                        {
                                                                            "type": "websocket",
                                                                            "uri": self.ws_server_url,
                                                                            "content-type": "audio/l16;rate=8000",
                                                                        }
                                                                    ],
                                                                },
                                                                {
                                                                    "action": "conversation", 
                                                                    "name": self.conf_id
                                                                }
                                                            ]
                                                        }
                                                    })
            # Say it takes 2 seconds for vonage to connect the websocket to the conference. 
            # TODO: Figure out a way around this assumption
            await asyncio.sleep(2)
            return True
        return False
    
    async def handle_call_transfer_event(self, uuid: str, conversation_uuid_to: str):
        """
        Find the participant which was just put into the conference.
        If websocket is not connected, use this participant to connect the websocket to conference.
        
        Return participant phone number or None
        """
        participant = next(
            (p for p in self.participant_info_map.values() if p.call_leg_id == uuid),
            None
        )
        
        if participant:
            participant.conference_conv_id = conversation_uuid_to
            if not self.is_websocket_connected:
                self.is_websocket_connected = await self._try_connecting_websocket_with_participant(participant)
            return participant.phone_number
    
        return None
            
    # TODO: Connect a websocket to the call
    async def start_conf(self, teacher_phone: str, student_phones: List[str]):
        """
        Starts a conference call between a teacher and students using Vonage API.
        """
        call_payload = {"type": "phone", "number": teacher_phone}
        call_data = {
            "to": [call_payload],
            "from": {
                "type": "phone", 
                "number": self.vonage_number
            },
            "event_url": [
                self.events_webhook_url + f"/{self.conf_id}"
            ],
            "ncco": [
                {
                    "action": "stream",
                    "streamUrl": [sas_gen.get_url_with_sas(SystemAudioMessages.WELCOME_TEACHER.value)]
                },
                {
                    "action": "conversation", 
                    "name": self.conf_id
                }
            ]
        }
        vonage_resp = self.client.voice.create_call(call_data)
        logger_instance.info("VONAGE TEACHER RESPONSE", json.dumps(vonage_resp, indent=2))
        self.teacher_phone_number = teacher_phone
        self.participant_info_map[teacher_phone] = VonageParticipantInfo(
                                                        phone_number=teacher_phone,
                                                        call_leg_id=vonage_resp['uuid'],
                                                        initial_conv_id=vonage_resp['conversation_uuid'])
        
        for student_phone in student_phones:
            call_payload = {"type": "phone", "number": student_phone}
            call_data = {
                "to": [call_payload],
                "from": {"type": "phone", "number": self.vonage_number},
                "event_url": [
                    self.events_webhook_url + f"/{self.conf_id}"
                ],
                "ncco": [
                    {
                        "action": "stream",
                        "streamUrl": [sas_gen.get_url_with_sas(SystemAudioMessages.WELCOME_STUDENT.value)]
                    },
                    {
                        "action": "conversation", 
                        "name": self.conf_id
                    }
                ]
            }
            vonage_resp = self.client.voice.create_call(call_data)
            logger_instance.info("VONAGE STUDENT RESPONSE", json.dumps(vonage_resp, indent=2))
            self.participant_info_map[student_phone] = VonageParticipantInfo(
                                                            phone_number=student_phone,
                                                            call_leg_id=vonage_resp['uuid'],
                                                            initial_conv_id=vonage_resp['conversation_uuid'])

    # client.update_call()
    async def end_conf(self):
        """
        Ends a call by its conference ID using the Vonage API.
        """
        self.is_websocket_connected = False
        for participant in self.participant_info_map.values():
            call_details = self.client.voice.get_call(uuid=participant.call_leg_id)
            if call_details['status'] == 'answered':
                logger_instance.info("ENDING CALL FOR PARTICIPANT", participant.phone_number)
                self.client.voice.update_call(uuid=participant.call_leg_id, action="hangup")
            else:
                logger_instance.info("CALL ALREADY ENDED FOR PARTICIPANT", participant.phone_number)
    
    async def reconnect_websocket(self):
        """
        Go through latest call statuses for all participants and on finding the first "answered" call leg,
        try connecting the websocket 
        """
        self.is_websocket_connected = False
        while not self.is_websocket_connected: 
            for participant_ph_number in self.participant_info_map:
                participant = self.participant_info_map[participant_ph_number]
                if participant.conference_conv_id: # The participant is already in the conference
                        self.is_websocket_connected = await self._try_connecting_websocket_with_participant(participant)
                        if self.is_websocket_connected:
                            break
                # VERY IMPORTANT : Stuck event loop otherwise
                await asyncio.sleep(2)

    # client.create_call()
    async def add_participant(self, phone_number: str):
        """
        Adds a participant to an ongoing call.
        """
        call_payload = {"type": "phone", "number": phone_number}
        call_data = {
            "to": [call_payload],
            "from": {"type": "phone", "number": self.vonage_number},
            "event_url": [
                self.events_webhook_url + f"/{self.conf_id}"
            ],
            "ncco": [{"action": "conversation", "name": self.conf_id}]
        }
        vonage_resp = self.client.voice.create_call(call_data)
        logger_instance.info("VONAGE ADD PARTICIPANT RESPONSE", json.dumps(vonage_resp, indent=2))
        self.participant_info_map[phone_number] = VonageParticipantInfo(
                                                        phone_number=phone_number,
                                                        call_leg_id=vonage_resp['uuid'],
                                                        conv_id=vonage_resp['conversation_uuid'])

    # client.update_call()
    async def remove_participant(self, phone_number: str):
        """
        Removes a participant from an ongoing call.
        """
        if phone_number in self.participant_info_map:
            participant_info = self.participant_info_map[phone_number]
            self.client.voice.update_call(uuid=participant_info.call_leg_id, action="hangup")
            del self.participant_info_map[phone_number]

    # client.update_call()
    async def mute_participant(self, phone_number: str):
        """
        Mutes a participant in the call.
        """
        if phone_number in self.participant_info_map:
            participant_info = self.participant_info_map[phone_number]
            self.client.voice.update_call(uuid=participant_info.call_leg_id, action="mute")

    # client.update_call()
    async def unmute_participant(self, phone_number: str):
        """
        Unmutes a participant in the call.
        """
        if phone_number in self.participant_info_map:
            participant_info = self.participant_info_map[phone_number]
            self.client.voice.update_call(uuid=participant_info.call_leg_id, action="unmute")
