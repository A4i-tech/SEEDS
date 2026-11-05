import { normalizePhoneNumber } from '@shared/utils/phoneUtils';
import { create } from 'zustand';
import type {
  AudioContentState,
  ConferenceNotification,
  Participant,
  SSEConferenceEvent,
} from '../types/conference.types';

interface ConferenceState {
  confId: string | null;
  classroomId: string | null;
  classroomName: string | null;
  isConfCallRunning: boolean;
  conferenceHoldDetected: boolean;
  audioContentState: AudioContentState;
  participantsMap: Record<string, Participant>;
  allClassroomStudents: { phoneNumber: string; name: string }[];
  notifications: ConferenceNotification[];
  previousStatus: Record<string, string>;

  startConference: (
    confId: string,
    classroomId: string,
    classroomName: string,
    teacher: Participant,
    students: Participant[],
    allClassroomStudents: { phoneNumber: string; name: string }[]
  ) => void;
  handleSSEEvent: (event: SSEConferenceEvent) => void;
  dismissNotification: (index: number) => void;
  reset: () => void;
}

const initialAudioContentState: AudioContentState = {
  current_url: '',
  status: 'Paused',
  paused_at: '',
  position_seconds: null,
  duration_seconds: null,
  speed: 1.0,
};

export const useConferenceStore = create<ConferenceState>((set, get) => ({
  confId: null,
  classroomId: null,
  classroomName: null,
  isConfCallRunning: false,
  conferenceHoldDetected: false,
  audioContentState: initialAudioContentState,
  participantsMap: {},
  allClassroomStudents: [],
  notifications: [],
  previousStatus: {},

  startConference: (confId, classroomId, classroomName, teacher, students, allClassroomStudents) => {
    const participantsMap: Record<string, Participant> = {};

    participantsMap[normalizePhoneNumber(teacher.phoneNumber)] = teacher;
    students.forEach((student) => {
      participantsMap[normalizePhoneNumber(student.phoneNumber)] = student;
    });
    set({ confId, classroomId, classroomName, participantsMap, allClassroomStudents, notifications: [] });
  },

  handleSSEEvent: (event) => {
    const { participantsMap, allClassroomStudents, previousStatus, conferenceHoldDetected } = get();
    const notifications: ConferenceNotification[] = [];

    if (event.hold_detected && !conferenceHoldDetected) {
      notifications.push({ type: 'conference_hold_detected', timestamp: new Date().toISOString() });
    }

    const nextMap = { ...participantsMap };
    const nextStatus: Record<string, string> = {};
    const seenPhones = new Set<string>();

    for (const [phoneNumber, data] of Object.entries(event.participants)) {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);

      seenPhones.add(normalizedPhone);
      nextStatus[normalizedPhone] = data.call_status;

      const existing = nextMap[normalizedPhone];

      if (data.role === 'Student' && previousStatus[normalizedPhone] === 'connected' && data.call_status === 'disconnected') {
        notifications.push({
          type: 'participant_dropped',
          participantName: existing?.name ?? data.name,
          participantPhone: data.phone_number,
          timestamp: new Date().toISOString(),
        });
      }

      const name = existing?.name ?? data.name ?? allClassroomStudents.find((s) => normalizePhoneNumber(s.phoneNumber) === normalizedPhone)?.name ?? 'Unknown';

      nextMap[normalizedPhone] = {
        name,
        phoneNumber: data.phone_number,
        role: existing?.role ?? data.role,
        call_status: data.call_status,
        is_muted: Boolean(data.is_muted),
        is_raised: Boolean(data.is_raised),
        raised_at: Number(data.raised_at),
      };
    }

    for (const [normalizedPhone, participant] of Object.entries(nextMap)) {
      if (!seenPhones.has(normalizedPhone) && participant.role === 'Student') {
        if (previousStatus[normalizedPhone] === 'connected' || participant.call_status === 'connected') {
          nextMap[normalizedPhone] = { ...participant, call_status: 'disconnected' };
        }
        nextStatus[normalizedPhone] = 'disconnected';
      }
    }

    set((state) => ({
      isConfCallRunning: event.is_running,
      conferenceHoldDetected: Boolean(event.hold_detected),
      audioContentState: { ...initialAudioContentState, ...event.audio_content_state },
      participantsMap: nextMap,
      previousStatus: nextStatus,
      notifications: [...state.notifications, ...notifications],
    }));
  },

  dismissNotification: (index) => {
    set((state) => ({ notifications: state.notifications.filter((_, i) => i !== index) }));
  },

  reset: () => {
    set({
      confId: null,
      classroomId: null,
      classroomName: null,
      isConfCallRunning: false,
      conferenceHoldDetected: false,
      audioContentState: initialAudioContentState,
      participantsMap: {},
      allClassroomStudents: [],
      notifications: [],
      previousStatus: {},
    });
  },
}));
