import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { APP_CONFIG } from "../config/appConfig";
import axiosInstance from "./axiosInstance";
import { normalizePhoneNumber } from "../utils/phoneUtils";

/**
 * All network requests use the centralized axios instance with
 * network-layer timeout (5 seconds) configured in axiosInstance.js
 */

export const createConference = async (teacherPhone, studentPhones, leaderPhone = null) => {
  // Normalize phone numbers to ensure consistent format (91XXXXXXXXXX)
  const normalizedTeacherPhone = normalizePhoneNumber(teacherPhone);
  const normalizedStudentPhones = studentPhones.map((phone) => normalizePhoneNumber(phone));
  const normalizedLeaderPhone = leaderPhone ? normalizePhoneNumber(leaderPhone) : null;

  const requestBody = {
    teacher_phone: normalizedTeacherPhone,
    student_phones: normalizedStudentPhones,
    ...(normalizedLeaderPhone && { leader_phone: normalizedLeaderPhone }),
  };

  console.log("Creating conference with request:", {
    teacher_phone: normalizedTeacherPhone,
    student_phones: normalizedStudentPhones,
    student_count: normalizedStudentPhones.length,
    leader_phone: normalizedLeaderPhone,
  });

  try {
    const response = await axiosInstance.post(API_ENDPOINTS.CONFERENCE.CREATE, requestBody);
    console.log("Conference created successfully:", response.data);
    return response.data;
  } catch (error) {
    console.error("Conference creation failed:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      error: error.response?.data || error.message,
    });

    if (error.message === "Request timed out. Please try again.") {
      throw new Error("Conference start timed out. Please try again.");
    }

    throw new Error(
      `Failed to create conference: ${error.response?.status || "Network error"} ${
        error.response?.statusText || error.message
      }`
    );
  }
};

export const startConferenceCall = async (confId) => {
  const response = await axiosInstance.post(API_ENDPOINTS.CONFERENCE.START(confId));
  return response;
};

export const endConferenceCall = async (confId) => {
  try {
    const response = await axiosInstance.put(API_ENDPOINTS.CONFERENCE.END(confId));
    return response;
  } catch (error) {
    console.error("End conference failed:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      error: error.response?.data || error.message,
    });

    if (error.message === "Request timed out. Please try again.") {
      throw new Error("End conference timed out. Please try again.");
    }

    throw new Error(
      `Failed to end conference: ${error.response?.status || "Network error"} ${
        error.response?.statusText || error.message
      }`
    );
  }
};

export const sinkConferenceCall = async (confId) => {
  const response = await axiosInstance.put(API_ENDPOINTS.CONFERENCE.SINK(confId));
  return response;
};

export const muteParticipant = async (confId, phone_number) => {
  // Normalize phone number to ensure consistent format (91XXXXXXXXXX)
  const normalizedPhone = normalizePhoneNumber(phone_number);
  const response = await axiosInstance.put(
    API_ENDPOINTS.CONFERENCE.MUTE(confId, normalizedPhone)
  );
  return response.data;
};

export const unmuteParticipant = async (confId, phone_number) => {
  // Normalize phone number to ensure consistent format (91XXXXXXXXXX)
  const normalizedPhone = normalizePhoneNumber(phone_number);
  const response = await axiosInstance.put(
    API_ENDPOINTS.CONFERENCE.UNMUTE(confId, normalizedPhone)
  );
  return response.data;
};

export const muteAll = async (confId) => {
  try {
    const response = await axiosInstance.put(API_ENDPOINTS.CONFERENCE.MUTE_ALL(confId));
    return response.data;
  } catch (error) {
    throw new Error(
      `Failed to mute all: ${error.response?.status || "Network error"} ${
        error.response?.statusText || error.message
      }`
    );
  }
};

export const unmuteAll = async (confId) => {
  try {
    const response = await axiosInstance.put(API_ENDPOINTS.CONFERENCE.UNMUTE_ALL(confId));
    return response.data;
  } catch (error) {
    throw new Error(
      `Failed to unmute all: ${error.response?.status || "Network error"} ${
        error.response?.statusText || error.message
      }`
    );
  }
};

export const playAudio = async (confId, url) => {
  const audioUrl =
    url ??
    `https://${APP_CONFIG.STORAGE_ACCOUNT_NAME}.blob.core.windows.net/output-container/25/1.0.wav`;
  const response = await axiosInstance.put(API_ENDPOINTS.CONFERENCE.PLAY_AUDIO(confId, audioUrl));
  return response;
};

export const pauseAudio = async (confId) => {
  const response = await axiosInstance.put(API_ENDPOINTS.CONFERENCE.PAUSE_AUDIO(confId));
  return response;
};

export const resumeAudio = async (confId) => {
  const response = await axiosInstance.put(API_ENDPOINTS.CONFERENCE.RESUME_AUDIO(confId));
  return response;
};

export const seekAudio = async (confId, deltaSeconds) => {
  const url = `${API_ENDPOINTS.CONFERENCE.SEEK_AUDIO(
    confId
  )}?delta_seconds=${encodeURIComponent(deltaSeconds)}`;
  const response = await axiosInstance.put(url);
  return response;
};

export const seekAudioAbsolute = async (confId, positionSeconds) => {
  const url = `${API_ENDPOINTS.CONFERENCE.SEEK_AUDIO(
    confId
  )}?position_seconds=${encodeURIComponent(positionSeconds)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to seek audio: ${response.status} ${response.statusText}`);
  }
  return response;
};

export const setPlaybackSpeed = async (confId, speed) => {
  const url = `${API_ENDPOINTS.CONFERENCE.SET_PLAYBACK_SPEED(
    confId
  )}?speed=${encodeURIComponent(speed)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to set playback speed: ${response.status} ${response.statusText}`);
  }
  return response;
};

export const addParticipant = async (confId, phone_number) => {
  // Normalize phone number to ensure consistent format (91XXXXXXXXXX)
  const normalizedPhone = normalizePhoneNumber(phone_number);
  const response = await axiosInstance.put(
    API_ENDPOINTS.CONFERENCE.ADD_PARTICIPANT(confId, normalizedPhone)
  );
  return response;
};

export const removeParticipant = async (confId, phone_number) => {
  // Normalize phone number to ensure consistent format (91XXXXXXXXXX)
  const normalizedPhone = normalizePhoneNumber(phone_number);

  try {
    const response = await axiosInstance.put(
      API_ENDPOINTS.CONFERENCE.REMOVE_PARTICIPANT(confId, normalizedPhone)
    );
    return response.data;
  } catch (error) {
    console.error("Participant removal failed:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      error: error.response?.data || error.message,
    });

    throw new Error(
      `Failed to remove participant: ${error.response?.status || "Network error"} ${
        error.response?.statusText || error.message
      }`
    );
  }
};

export const fetchAudioContent = async () => {
  // Note: Auth token is automatically added by axios interceptor
  const response = await axiosInstance.get(API_ENDPOINTS.GET_AUDIO_CONTENT);
  return response.data;
};
