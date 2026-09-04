import axiosInstance from "./axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { normalizePhoneNumber } from "../utils/phoneUtils";
import { APP_CONFIG } from "../config/appConfig";

const CONF_BASE = `${APP_CONFIG.BASE_URL}/conference`;

/**
 * Send recorded audio to the backend voice-command endpoint.
 * Returns { transcript, commands, results } or { transcript, error }.
 */
export async function sendVoiceCommand(audioBlob, context = {}) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  formData.append("context", JSON.stringify(context));

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
export async function sendTextCommand(text, context = {}) {
  const response = await axiosInstance.post(
    API_ENDPOINTS.META.TEXT_COMMAND,
    { command: text, context },
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
 * Returns { text, audio_base64 }.
 */
export async function fetchTTSPrompt(type) {
  const response = await axiosInstance.post(
    API_ENDPOINTS.META.TTS_PROMPT,
    { type },
    { timeout: 30000 }
  );
  return response.data;
}

/**
 * Resolve {{stepN.data.field}} placeholders in a single string using accumulated results.
 * stepNum and fieldPath come from an LLM-planned command, so the referenced step or field
 * is not guaranteed to exist (e.g. an out-of-range step, or a field the response lacks).
 */
function resolvePlaceholdersInString(str, resultContext) {
  // Matches {{stepN.data}} or {{stepN.data.field.path}} placeholder tokens.
  return str.replace(/\{\{step(\d+)\.data([^}]*)\}\}/g, (_, stepNum, fieldPath) => {
    const stepData = resultContext[`step${stepNum}`]?.data;
    if (!stepData) return "";
    if (!fieldPath) return JSON.stringify(stepData);
    // Strips the leading dot from a field path, e.g. ".id" -> "id".
    const parts = fieldPath.replace(/^\./, "").split(".");
    let val = stepData;
    for (const part of parts) val = val?.[part];
    return val ?? "";
  });
}

/**
 * Resolve {{stepN.data.field}} placeholders throughout a value (path string or JSON body).
 * Command bodies come from an LLM plan and are not schema-validated, so a value here can
 * genuinely be a string, an object/array to walk, or any other JSON leaf type to pass through.
 */
function resolveClientPlaceholders(value, resultContext) {
  if (typeof value === "string") return resolvePlaceholdersInString(value, resultContext);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveClientPlaceholders(v, resultContext);
    return out;
  }
  return value;
}

/**
 * Execute commands flagged as requiresClientExecution directly against ConferenceV2.
 * Accepts the full results array from the backend and mutates PENDING_CLIENT entries in-place.
 * Returns the updated results array.
 */
export async function executeClientCommands(results) {
  if (!CONF_BASE) return results;

  const resultContext = {};

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    // Build context from already-resolved backend results
    resultContext[`step${i + 1}`] = { data: r.data, status: r.status };

    if (!r.requiresClientExecution) continue;

    try {
      const path = resolveClientPlaceholders(r.path, resultContext);
      let body = resolveClientPlaceholders(r.body, resultContext);
      
      // Strips a leading "/call/" prefix so the path targets the conference service directly.
      const confPath = path.replace(/^\/call\//, "/");
      const url = `${CONF_BASE}${confPath}`;

      if (body && typeof body === "object") {
        if (body.teacher_phone) body.teacher_phone = normalizePhoneNumber(body.teacher_phone);
        if (Array.isArray(body.student_phones)) body.student_phones = body.student_phones.map(normalizePhoneNumber);
        if (body.leader_phone) body.leader_phone = normalizePhoneNumber(body.leader_phone);
        if (body.phone_number) body.phone_number = normalizePhoneNumber(body.phone_number);
      }

      console.log(`[seeds-client] Executing conf step ${i + 1}: ${r.method} ${url}`);

      const response = await fetch(url, {
        method: r.method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      let data;
      try { data = await response.json(); } catch { data = null; }

      results[i] = {
        ...r,
        status: response.status,
        data,
        requiresClientExecution: false,
      };
      resultContext[`step${i + 1}`] = { data, status: response.status };
    } catch (err) {
      results[i] = {
        ...r,
        status: 500,
        error: err.message,
        requiresClientExecution: false,
      };
    }
  }

  return results;
}
