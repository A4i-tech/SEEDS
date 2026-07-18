/**
 * Content History Service
 *
 * Manages playback history for audio content, matching Android app behavior.
 * Uses localStorage for persistence across browser sessions.
 *
 * Architecture mirrors Android's UserPreferencesRepository.saveContentToHistory():
 * - Move-to-top deduplication (if content already exists, remove old and add new at top)
 * - Limited to DEFAULT_CONTENT_HISTORY_SIZE items
 */

const STORAGE_KEY = "seeds_content_history";
const DEFAULT_CONTENT_HISTORY_SIZE = 10; // Configurable, default 10 (Android uses 5, but requirements suggest 10-20)

/**
 * Content History Item Model
 * Mirrors Android's ContentHistoryItem structure
 */
export class ContentHistoryItem {
  constructor({
    content_id,
    title,
    content_type,
    url,
    last_played_at,
    classroom_name = null,
    student_count = null,
    was_conference = false,
    description = null,
    language = null,
  }) {
    this.content_id = content_id;
    this.title = title;
    this.content_type = content_type;
    this.url = url;
    this.last_played_at = last_played_at; // Unix timestamp in milliseconds
    this.classroom_name = classroom_name;
    this.student_count = student_count;
    this.was_conference = was_conference;
    this.description = description;
    this.language = language;
  }

  /**
   * Check if this history item refers to the same content as another.
   * Used for move-to-top deduplication strategy.
   */
  isSameContent(contentId) {
    return this.content_id === contentId;
  }
}

/**
 * Get all content history items, ordered by most recent first.
 * @returns {ContentHistoryItem[]}
 */
export function getContentHistory() {
  try {
    const historyJson = localStorage.getItem(STORAGE_KEY);
    if (!historyJson) {
      return [];
    }

    const historyData = JSON.parse(historyJson);

    // Convert plain objects back to ContentHistoryItem instances
    return historyData.map((item) => new ContentHistoryItem(item));
  } catch (error) {
    console.error("Error reading content history:", error);
    return [];
  }
}

/**
 * Save content to history with move-to-top deduplication.
 *
 * If the content already exists in history, it's moved to the top with updated timestamp.
 * Otherwise, it's added to the top and the list is trimmed to DEFAULT_CONTENT_HISTORY_SIZE.
 *
 * Mirrors Android's saveContentToHistory() behavior.
 *
 * @param {Object} content - { id, name, type, language, url, description }
 * @param {Object} options - Optional metadata
 * @param {string} options.classroom_name - Classroom/group name where content was played
 * @param {number} options.student_count - Number of students in the session
 * @param {boolean} options.was_conference - Whether this was a conference call
 * @param {number} options.maxSize - Maximum history size (defaults to DEFAULT_CONTENT_HISTORY_SIZE)
 */
export function saveContentToHistory(content, options = {}) {
  try {
    const {
      classroom_name = null,
      student_count = null,
      was_conference = false,
      maxSize = DEFAULT_CONTENT_HISTORY_SIZE,
    } = options;

    if (!content.url) {
      console.warn("Cannot save content to history: missing URL", content);
      return;
    }

    // Get current history
    const currentHistory = getContentHistory();

    // Create new history item with current timestamp
    const newItem = new ContentHistoryItem({
      content_id: content.id,
      title: content.name,
      content_type: content.type,
      url: content.url,
      last_played_at: Date.now(),
      classroom_name,
      student_count,
      was_conference,
      description: content.description,
      language: content.language,
    });

    // Remove existing entry for this content (move-to-top deduplication)
    const filteredList = currentHistory.filter((item) => !item.isSameContent(content.id));

    // Add new item at the top and limit to configured size
    const newList = [newItem, ...filteredList].slice(0, maxSize);

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
  } catch (error) {
    console.error("Error saving content to history:", error);
  }
}

/**
 * Clear all content history.
 */
export function clearContentHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing content history:", error);
  }
}

/**
 * Get the maximum history size (configurable).
 * @returns {number}
 */
export function getMaxHistorySize() {
  return DEFAULT_CONTENT_HISTORY_SIZE;
}
