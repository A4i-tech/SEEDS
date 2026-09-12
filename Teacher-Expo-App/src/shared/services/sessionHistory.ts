import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'seeds_session_history';
const DEFAULT_SESSION_HISTORY_SIZE = 3;

export interface SessionHistoryItem {
  group_id: string;
  group_name: string;
  timestamp: number;
  student_count: number;
  was_conference: boolean;
}

export async function getSessionHistory(): Promise<SessionHistoryItem[]> {
  const historyJson = await AsyncStorage.getItem(STORAGE_KEY);
  return historyJson ? JSON.parse(historyJson) : [];
}

export async function addSessionToHistory(
  session: { group_id: string; group_name: string; student_count: number },
  maxSize = DEFAULT_SESSION_HISTORY_SIZE
) {
  const currentHistory = await getSessionHistory();
  const newItem: SessionHistoryItem = {
    group_id: session.group_id,
    group_name: session.group_name,
    timestamp: Date.now(),
    student_count: session.student_count,
    was_conference: true,
  };
  const newList = [newItem, ...currentHistory].slice(0, maxSize);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
}

export async function clearSessionHistory() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
