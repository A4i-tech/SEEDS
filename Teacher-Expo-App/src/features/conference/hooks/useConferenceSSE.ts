import { API_BASE_URL } from '@config/env';
import { getAuthToken } from '@shared/services/apiClient';
import EventSource from 'react-native-sse';
import React from 'react';
import { useConferenceStore } from '../store/conferenceStore';
import type { SSEConferenceEvent } from '../types/conference.types';

export function useConferenceSSE(confId: string | null) {
  const handleSSEEvent = useConferenceStore((state) => state.handleSSEEvent);

  React.useEffect(() => {
    if (!confId) return;
    // Binds the store to this conference even when the screen is reached by a
    // direct URL / reload rather than through startConference.
    useConferenceStore.setState({ confId });

    const token = getAuthToken();
    const url = `${API_BASE_URL}/conference/teacherappconnect/${confId}?token=${encodeURIComponent(token ?? '')}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('message', (event) => {
      if (!event.data) return;
      const parsed = JSON.parse(event.data) as SSEConferenceEvent;
      handleSSEEvent(parsed);
    });

    return () => {
      eventSource.close();
    };
  }, [confId, handleSSEEvent]);
}
