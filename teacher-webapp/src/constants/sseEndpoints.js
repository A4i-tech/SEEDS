import {APP_CONFIG} from "../config/appConfig";

const {CONF_SERVER_BASE_URI} = APP_CONFIG;

export const SSE_ENDPOINTS = {
  CONFERENCE: {
    TEACHER_CONNECT: (conferenceId) => `${CONF_SERVER_BASE_URI}/conference/teacherappconnect/${conferenceId}`,
  }
}


