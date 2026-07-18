/**
 * Session History Service
 *
 * Manages conference session history, matching Android app behavior.
 * Uses localStorage for persistence across browser sessions.
 *
 * Architecture mirrors Android's UserPreferencesRepository.addSessionToHistory():
 * - Most recent first
 * - Limited to DEFAULT_SESSION_HISTORY_SIZE items
 */

import { isLocalStorageAvailable } from "../utils/authHelpers";

const STORAGE_KEY = "seeds_session_history";
const DEFAULT_SESSION_HISTORY_SIZE = 10; // Configurable, default 10 (Android uses 10)

/**
 * Session History Item Model
 * Mirrors Android's SessionHistoryItem structure
 */
export class SessionHistoryItem {
  constructor({
    group_id,
    group_name,
    timestamp,
    student_count,
    was_conference = true,
  }) {
    this.group_id = group_id;
    this.group_name = group_name;
    this.timestamp = timestamp; // Unix timestamp in milliseconds
    this.student_count = student_count;
    this.was_conference = was_conference;
  }
}

/**
 * Get all session history items, ordered by most recent first.
 * @returns {SessionHistoryItem[]}
 */
export function getSessionHistory() {
  if (!isLocalStorageAvailable()) {
    console.warn("localStorage is not available, returning empty history");
    return [];
  }

  try {
    const historyJson = localStorage.getItem(STORAGE_KEY);
    if (!historyJson) {
      return [];
    }

    const historyData = JSON.parse(historyJson);

    // Convert plain objects back to SessionHistoryItem instances
    return historyData.map((item) => new SessionHistoryItem(item));
  } catch (error) {
    console.error("Error reading session history:", error);
    return [];
  }
}

/**
 * Add a conference session to history.
 *
 * Mirrors Android's addSessionToHistory() behavior.
 *
 * @param {Object} sessionData - Session data
 * @param {string} sessionData.group_id - Classroom/group ID
 * @param {string} sessionData.group_name - Classroom/group name
 * @param {number} sessionData.student_count - Number of students in the session
 * @param {Object} options - Optional metadata
 * @param {number} options.maxSize - Maximum history size (defaults to DEFAULT_SESSION_HISTORY_SIZE)
 */
export function addSessionToHistory(sessionData, options = {}) {
  if (!isLocalStorageAvailable()) {
    console.warn("localStorage is not available, cannot save session history");
    return;
  }

  try {
    const { maxSize = DEFAULT_SESSION_HISTORY_SIZE } = options;
    const { group_id, group_name, student_count } = sessionData;

    if (!group_id || !group_name) {
      console.warn("Cannot save session to history: missing group_id or group_name", sessionData);
      return;
    }

    // Get current history
    const currentHistory = getSessionHistory();

    // Create new session item with current timestamp
    const newItem = new SessionHistoryItem({
      group_id,
      group_name,
      timestamp: Date.now(),
      student_count: student_count ?? 0,
      was_conference: true,
    });

    // Add new item at the top and limit to configured size
    const newList = [newItem, ...currentHistory].slice(0, maxSize);

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
  } catch (error) {
    console.error("Error saving session to history:", error);
  }
}

/**
 * Clear all session history.
 */
export function clearSessionHistory() {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing session history:", error);
  }
}

/**
 * Get the maximum history size (configurable).
 * @returns {number}
 */
export function getMaxHistorySize() {
  return DEFAULT_SESSION_HISTORY_SIZE;
}
