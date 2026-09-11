import { apiClient } from '@shared/services/apiClient';
import { normalizePhoneNumber } from '@shared/utils/phoneUtils';

export async function createConference(
  teacherPhone: string,
  studentPhones: string[],
  teacherName: string,
  studentNames: string[]
) {
  const { data } = await apiClient.post('/conference/create', {
    teacher_phone: normalizePhoneNumber(teacherPhone),
    teacher_name: teacherName,
    student_phones: studentPhones.map(normalizePhoneNumber),
    student_names: studentNames,
  });
  return data;
}

export const startConferenceCall = (confId: string) => apiClient.post(`/conference/start/${confId}`);
export const endConferenceCall = (confId: string) => apiClient.put(`/conference/end/${confId}`);
export const sinkConferenceCall = (confId: string) => apiClient.put(`/conference/sink/${confId}`);

export const muteParticipant = (confId: string, phoneNumber: string) =>
  apiClient.put(`/conference/muteparticipant/${confId}`, null, {
    params: { phone_number: normalizePhoneNumber(phoneNumber) },
  });

export const unmuteParticipant = (confId: string, phoneNumber: string) =>
  apiClient.put(`/conference/unmuteparticipant/${confId}`, null, {
    params: { phone_number: normalizePhoneNumber(phoneNumber) },
  });

export const muteAll = (confId: string) => apiClient.put(`/conference/muteall/${confId}`);
export const unmuteAll = (confId: string) => apiClient.put(`/conference/unmuteall/${confId}`);

export const playAudio = (confId: string, url: string) =>
  apiClient.put(`/conference/playaudio/${confId}`, null, { params: { url } });

export const pauseAudio = (confId: string) => apiClient.put(`/conference/pauseaudio/${confId}`);
export const resumeAudio = (confId: string) => apiClient.put(`/conference/resumeaudio/${confId}`);

export const seekAudio = (confId: string, deltaSeconds: number) =>
  apiClient.put(`/conference/seekaudio/${confId}`, null, { params: { delta_seconds: deltaSeconds } });

export const setPlaybackSpeed = (confId: string, speed: number) =>
  apiClient.put(`/conference/setplaybackspeed/${confId}`, null, { params: { speed } });

export const addParticipant = (confId: string, phoneNumber: string, name?: string) =>
  apiClient.put(`/conference/addparticipant/${confId}`, null, {
    params: { phone_number: normalizePhoneNumber(phoneNumber), name },
  });

export const removeParticipant = (confId: string, phoneNumber: string) =>
  apiClient.put(`/conference/removeparticipant/${confId}`, null, {
    params: { phone_number: normalizePhoneNumber(phoneNumber) },
  });
