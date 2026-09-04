import { APP_CONFIG } from "../config/appConfig";

const BASE_URL = APP_CONFIG.BASE_URL;
const CONF_BASE = `${BASE_URL}/conference`;
export const API_ENDPOINTS = {
  LOGIN: `${BASE_URL}/teacher/login`,
  LOGOUT: `${BASE_URL}/teacher/logout`,
  REFRESH: `${BASE_URL}/auth/token/refresh`,
  GET_TEACHER_ME: `${BASE_URL}/teacher/me`,
  GET_STUDENTS: `${BASE_URL}/student`,
  GET_AUDIO_CONTENT: `${BASE_URL}/content`,
  GET_CONTENT: `${BASE_URL}/content`,
  GET_CONTENT_SAS_URL: `${BASE_URL}/content/sasUrl`,
  HEALTH_PING: `${BASE_URL}/health`,
  CLASSROOM: {
    GET_ALL: `${BASE_URL}/class`,
    GET_BY_ID: (classId) => `${BASE_URL}/class/${classId}`,
    CREATE: `${BASE_URL}/class`,
    UPDATE: `${BASE_URL}/class`,
    DELETE: (classId) => `${BASE_URL}/class/${classId}`,
  },
  META: {
    VOICE_COMMAND: `${BASE_URL}/meta/voice-command`,
    TEXT_COMMAND: `${BASE_URL}/meta/text-command`,
    TRANSCRIBE: `${BASE_URL}/meta/transcribe`,
    TTS_PROMPT: `${BASE_URL}/meta/tts-prompt`,
  },
  CONFERENCE: {
    CREATE: `${CONF_BASE}/create`,
    START: (confId) => `${CONF_BASE}/start/${confId}`,
    END: (confId) => `${CONF_BASE}/end/${confId}`,
    SINK: (confId) => `${CONF_BASE}/sink/${confId}`,
    MUTE: (confId, phone) => `${CONF_BASE}/muteparticipant/${confId}?phone_number=${phone}`,
    UNMUTE: (confId, phone) => `${CONF_BASE}/unmuteparticipant/${confId}?phone_number=${phone}`,
    MUTE_ALL: (confId) => `${CONF_BASE}/muteall/${confId}`,
    UNMUTE_ALL: (confId) => `${CONF_BASE}/unmuteall/${confId}`,
    PLAY_AUDIO: (confId, url) => `${CONF_BASE}/playaudio/${confId}?url=${encodeURIComponent(url)}`,
    PAUSE_AUDIO: (confId) => `${CONF_BASE}/pauseaudio/${confId}`,
    RESUME_AUDIO: (confId) => `${CONF_BASE}/resumeaudio/${confId}`,
    SEEK_AUDIO: (confId) => `${CONF_BASE}/seekaudio/${confId}`,
    SET_PLAYBACK_SPEED: (confId) => `${CONF_BASE}/setplaybackspeed/${confId}`,
    ADD_PARTICIPANT: (confId, phone, name) =>
      `${CONF_BASE}/addparticipant/${confId}?phone_number=${phone}${name ? `&name=${encodeURIComponent(name)}` : ""}`,
    REMOVE_PARTICIPANT: (confId, phone, name) =>
      `${CONF_BASE}/removeparticipant/${confId}?phone_number=${phone}${name ? `&name=${encodeURIComponent(name)}` : ""}`,
  },
};
