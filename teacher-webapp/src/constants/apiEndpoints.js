import { APP_CONFIG } from "../config/appConfig";

const BASE_URL = APP_CONFIG.BASE_URL;
const CONF_BASE = `${APP_CONFIG.CONF_SERVER_BASE_URI}/conference`;
export const API_ENDPOINTS = {
  LOGIN: `${BASE_URL}/teacher/login`,
  REGISTER: `${BASE_URL}/teacher/register`,
  GET_TEACHER_STUDENTS: `${BASE_URL}/v1/teacher/students`,
  ADD_TEACHER_STUDENTS: `${BASE_URL}/v1/teacher/add-students`,
  GET_SCHOOLS: `${BASE_URL}/tenant/names`,
  GET_AUDIO_CONTENT: `${BASE_URL}/content`,
  CONFERENCE: {
    CREATE: `${CONF_BASE}/create`,
    START: (confId) => `${CONF_BASE}/start/${confId}`,
    END: (confId) => `${CONF_BASE}/end/${confId}`,
    SINK: (confId) => `${CONF_BASE}/sink/${confId}`,
    MUTE: (confId, phone) => `${CONF_BASE}/muteparticipant/${confId}?phone_number=${phone}`,
    UNMUTE: (confId, phone) => `${CONF_BASE}/unmuteparticipant/${confId}?phone_number=${phone}`,
    PLAY_AUDIO: (confId, url) => `${CONF_BASE}/playaudio/${confId}?url=${url}`,
    PAUSE_AUDIO: (confId) => `${CONF_BASE}/pauseaudio/${confId}`,
    RESUME_AUDIO: (confId) => `${CONF_BASE}/resumeaudio/${confId}`,
    SEEK_AUDIO: (confId) => `${CONF_BASE}/seekaudio/${confId}`,
    ADD_PARTICIPANT: (confId, phone) =>
      `${CONF_BASE}/addparticipant/${confId}?phone_number=${phone}`,
  },
};
