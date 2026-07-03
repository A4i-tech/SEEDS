import { APP_CONFIG } from "../config/appConfig";

const { BASE_URL } = APP_CONFIG;

export const SSE_ENDPOINTS = {
  CONFERENCE: {
    TEACHER_CONNECT: (conferenceId) =>
      `${BASE_URL}/conference/teacherappconnect/${conferenceId}`,
  },
};
