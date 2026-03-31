import axiosInstance from "./axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

/**
 * Send recorded audio to the backend voice-command endpoint.
 * Returns { transcript, commands, results } or { transcript, error }.
 */
export async function sendVoiceCommand(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await axiosInstance.post(API_ENDPOINTS.META.VOICE_COMMAND, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Send a text command to the backend for execution.
 * Returns { commands, results } or { error }.
 */
export async function sendTextCommand(text) {
  const response = await axiosInstance.post(
    API_ENDPOINTS.META.TEXT_COMMAND,
    { command: text },
    { timeout: 30000 }
  );
  return response.data;
}

/**
 * Transcribe audio only (no execution).
 */
export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await axiosInstance.post(API_ENDPOINTS.META.TRANSCRIBE, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Fetch a Seeds AI TTS prompt (welcome, thinking).
 * Returns { text, audioBase64 }.
 */
export async function fetchTTSPrompt(type) {
  const response = await axiosInstance.post(
    API_ENDPOINTS.META.TTS_PROMPT,
    { type },
    { timeout: 30000 }
  );
  return response.data;
}
