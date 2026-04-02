import { APP_CONFIG } from "../config/appConfig";

const BASE_URL = APP_CONFIG.BASE_URL;
const CONF_BASE = `${APP_CONFIG.CONF_SERVER_BASE_URI}/conference`;
export const API_ENDPOINTS = {
  LOGIN: `${BASE_URL}/teacher/login`,
  REGISTER: `${BASE_URL}/teacher/register`,
  GET_TEACHER_ME: `${BASE_URL}/teacher/me`,
  GET_TEACHER_STUDENTS: `${BASE_URL}/v1/teacher/students`,
  ADD_TEACHER_STUDENTS: `${BASE_URL}/v1/teacher/add-students`,
  GET_SCHOOLS: `${BASE_URL}/tenant/names`,
  GET_AUDIO_CONTENT: `${BASE_URL}/content`,
  GET_CONTENT: `${BASE_URL}/content`,
  GET_CONTENT_SAS_URL: `${BASE_URL}/content/sasUrl`,
  CLASSROOM: {
    GET_ALL: `${BASE_URL}/class`,
    GET_BY_ID: (classId) => `${BASE_URL}/class/${classId}`,
    CREATE: `${BASE_URL}/class`,
    UPDATE: `${BASE_URL}/class`,
    DELETE: (classId) => `${BASE_URL}/class/${classId}`,
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
    PLAY_AUDIO: (confId, url) => `${CONF_BASE}/playaudio/${confId}?url=${url}`,
    PAUSE_AUDIO: (confId) => `${CONF_BASE}/pauseaudio/${confId}`,
    RESUME_AUDIO: (confId) => `${CONF_BASE}/resumeaudio/${confId}`,
    SEEK_AUDIO: (confId) => `${CONF_BASE}/seekaudio/${confId}`,
    SET_PLAYBACK_SPEED: (confId) => `${CONF_BASE}/setplaybackspeed/${confId}`,
    ADD_PARTICIPANT: (confId, phone) =>
      `${CONF_BASE}/addparticipant/${confId}?phone_number=${phone}`,
    REMOVE_PARTICIPANT: (confId, phone) =>
      `${CONF_BASE}/removeparticipant/${confId}?phone_number=${phone}`,
  },
};
