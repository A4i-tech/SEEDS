/**
 * Content History Service
 *
 * Manages playback history for audio content, matching Android app behavior.
 * Uses localStorage for persistence across browser sessions.
 *
 * Architecture mirrors Android's UserPreferencesRepository.saveContentToHistory():
 * - Move-to-top deduplication (if content already exists, remove old and add new at top)
 * - Limited to DEFAULT_CONTENT_HISTORY_SIZE items
 * - Stores: contentId, title, contentType, url, lastPlayedAt, classroomName, studentCount, wasConference
 */

const STORAGE_KEY = "seeds_content_history";
const DEFAULT_CONTENT_HISTORY_SIZE = 10; // Configurable, default 10 (Android uses 5, but requirements suggest 10-20)

/**
 * Content History Item Model
 * Mirrors Android's ContentHistoryItem structure
 */
export class ContentHistoryItem {
  constructor({
    contentId,
    title,
    contentType,
    url,
    lastPlayedAt,
    classroomName = null,
    studentCount = null,
    wasConference = false,
    description = null,
    language = null,
  }) {
    this.contentId = contentId;
    this.title = title;
    this.contentType = contentType;
    this.url = url;
    this.lastPlayedAt = lastPlayedAt; // Unix timestamp in milliseconds
    this.classroomName = classroomName;
    this.studentCount = studentCount;
    this.wasConference = wasConference;
    this.description = description;
    this.language = language;
  }

  /**
   * Check if this history item refers to the same content as another.
   * Used for move-to-top deduplication strategy.
   */
  isSameContent(other) {
    if (typeof other === "string") {
      return this.contentId === other;
    }
    return this.contentId === other.contentId;
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
    if (!Array.isArray(historyData)) {
      return [];
    }

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
 * @param {Object} content - Content object with at minimum: id, name/title, url
 * @param {Object} options - Optional metadata
 * @param {string} options.classroomName - Classroom/group name where content was played
 * @param {number} options.studentCount - Number of students in the session
 * @param {boolean} options.wasConference - Whether this was a conference call
 * @param {number} options.maxSize - Maximum history size (defaults to DEFAULT_CONTENT_HISTORY_SIZE)
 */
export function saveContentToHistory(content, options = {}) {
  try {
    const {
      classroomName = null,
      studentCount = null,
      wasConference = false,
      maxSize = DEFAULT_CONTENT_HISTORY_SIZE,
    } = options;

    // Get current history
    const currentHistory = getContentHistory();

    // Extract content metadata
    const contentId = content.id || content._id || content.url; // Use URL as fallback ID
    const title =
      content.name ||
      content.title?.english ||
      content.title?.local ||
      content.title ||
      "Unnamed Audio";
    const contentType = content.type || "Audio";
    const url = content.url || content.audioUrl;
    const description = content.description || null;
    const language = content.language || null;

    if (!url) {
      console.warn("Cannot save content to history: missing URL", content);
      return;
    }

    // Create new history item with current timestamp
    const newItem = new ContentHistoryItem({
      contentId,
      title,
      contentType,
      url,
      lastPlayedAt: Date.now(),
      classroomName,
      studentCount,
      wasConference,
      description,
      language,
    });

    // Remove existing entry for this content (move-to-top deduplication)
    const filteredList = currentHistory.filter((item) => !item.isSameContent(contentId));

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
