import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { APP_CONFIG } from "../config/appConfig";

export const createConference = async (teacherPhone, studentPhones) => {
  const response = await fetch(API_ENDPOINTS.CONFERENCE.CREATE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      teacher_phone: teacherPhone,
      student_phones: studentPhones,
    }),
  });
  return response.json();
};

export const startConferenceCall = async (confId) => {
  return fetch(API_ENDPOINTS.CONFERENCE.START(confId), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const endConferenceCall = async (confId) => {
  return fetch(API_ENDPOINTS.CONFERENCE.END(confId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const sinkConferenceCall = async (confId) => {
  return fetch(API_ENDPOINTS.CONFERENCE.SINK(confId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const muteParticipant = async (confId, phone_number) => {
  return fetch(API_ENDPOINTS.CONFERENCE.MUTE(confId, phone_number), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const unmuteParticipant = async (confId, phone_number) => {
  return fetch(API_ENDPOINTS.CONFERENCE.UNMUTE(confId, phone_number), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const playAudio = async (confId, url) => {
  const audioUrl =
    url ??
    `https://${APP_CONFIG.STORAGE_ACCOUNT_NAME}.blob.core.windows.net/output-container/25/1.0.wav`;
  return fetch(API_ENDPOINTS.CONFERENCE.PLAY_AUDIO(confId, audioUrl), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const pauseAudio = async (confId) => {
  return fetch(API_ENDPOINTS.CONFERENCE.PAUSE_AUDIO(confId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const resumeAudio = async (confId) => {
  return fetch(API_ENDPOINTS.CONFERENCE.RESUME_AUDIO(confId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const seekAudio = async (confId, deltaSeconds) => {
  return fetch(API_ENDPOINTS.CONFERENCE.SEEK_AUDIO(confId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      delta_seconds: deltaSeconds,
    }),
  });
};

export const addParticipant = async (confId, phone_number) => {
  return fetch(API_ENDPOINTS.CONFERENCE.ADD_PARTICIPANT(confId, phone_number), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const fetchAudioContent = async () => {
  const token = localStorage.getItem("authToken");
  const response = await fetch(API_ENDPOINTS.GET_AUDIO_CONTENT, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch audio content");
  }

  return response.json();
};
