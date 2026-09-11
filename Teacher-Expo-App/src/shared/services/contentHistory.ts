import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'seeds_content_history';
const DEFAULT_CONTENT_HISTORY_SIZE = 10;

export interface ContentHistoryItem {
  content_id: string;
  title: string;
  url: string;
  last_played_at: number;
  classroom_name: string | null;
  student_count: number | null;
  was_conference: boolean;
  language: string | null;
}

export async function getContentHistory(): Promise<ContentHistoryItem[]> {
  const historyJson = await AsyncStorage.getItem(STORAGE_KEY);
  return historyJson ? JSON.parse(historyJson) : [];
}

export async function saveContentToHistory(
  content: { id: string; title: string; url: string; language: string },
  options: { classroom_name?: string | null; student_count?: number | null; was_conference?: boolean } = {},
  maxSize = DEFAULT_CONTENT_HISTORY_SIZE
) {
  const currentHistory = await getContentHistory();
  const newItem: ContentHistoryItem = {
    content_id: content.id,
    title: content.title,
    url: content.url,
    last_played_at: Date.now(),
    classroom_name: options.classroom_name ?? null,
    student_count: options.student_count ?? null,
    was_conference: options.was_conference ?? false,
    language: content.language,
  };
  const filteredList = currentHistory.filter((item) => item.content_id !== content.id);
  const newList = [newItem, ...filteredList].slice(0, maxSize);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
}

export async function clearContentHistory() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
