export interface Participant {
  name: string;
  phoneNumber: string;
  role: 'Teacher' | 'Student';
  raised_at: number;
  is_raised: boolean;
  is_muted: boolean;
  call_status: 'connected' | 'disconnected';
}

export interface AudioContentState {
  current_url: string;
  status: string;
  paused_at: string;
  position_seconds: number | null;
  duration_seconds: number | null;
  speed: number;
}

export interface SSEParticipantData {
  role: 'Teacher' | 'Student';
  phone_number: string;
  call_status: 'connected' | 'disconnected';
  is_muted: boolean;
  is_raised: boolean;
  raised_at: number;
  name?: string;
}

export interface SSEConferenceEvent {
  is_running: boolean;
  hold_detected: boolean;
  audio_content_state: Partial<AudioContentState>;
  participants: Record<string, SSEParticipantData>;
}

export interface ConferenceNotification {
  type: 'participant_dropped' | 'conference_hold_detected';
  participantName?: string;
  participantPhone?: string;
  timestamp: string;
}
