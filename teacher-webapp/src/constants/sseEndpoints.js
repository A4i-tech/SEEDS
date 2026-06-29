import { APP_CONFIG } from "../config/appConfig";

const { CONF_SERVER_BASE_URI } = APP_CONFIG;

export const SSE_ENDPOINTS = {
  CONFERENCE: {
    TEACHER_CONNECT: (conferenceId) => {
      const token = localStorage.getItem("authToken");
      const params = token ? `?token=${encodeURIComponent(token)}` : "";
      return `${CONF_SERVER_BASE_URI}/conference/teacherappconnect/${conferenceId}${params}`;
    },
  },
};
