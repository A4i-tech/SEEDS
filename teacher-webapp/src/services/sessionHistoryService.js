/**
 * Session History Service
 *
 * Manages conference session history, matching Android app behavior.
 * Uses localStorage for persistence across browser sessions.
 *
 * Architecture mirrors Android's UserPreferencesRepository.addSessionToHistory():
 * - Most recent first
 * - Limited to DEFAULT_SESSION_HISTORY_SIZE items
 * - Stores: groupId, groupName, timestamp, studentCount, wasConference
 */

import { isLocalStorageAvailable } from "../utils/authHelpers";

const STORAGE_KEY = "seeds_session_history";
const DEFAULT_SESSION_HISTORY_SIZE = 5; 

/**
 * Session History Item Model
 * Mirrors Android's SessionHistoryItem structure
 */
export class SessionHistoryItem {
  constructor({ groupId, groupName, timestamp, studentCount, wasConference = true }) {
    this.groupId = groupId;
    this.groupName = groupName;
    this.timestamp = timestamp; // Unix timestamp in milliseconds
    this.studentCount = studentCount;
    this.wasConference = wasConference;
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
    if (!Array.isArray(historyData)) {
      return [];
    }

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
 * @param {string} sessionData.groupId - Classroom/group ID
 * @param {string} sessionData.groupName - Classroom/group name
 * @param {number} sessionData.studentCount - Number of students in the session
 * @param {boolean} sessionData.wasConference - Whether this was a conference call (default: true)
 * @param {number} options.maxSize - Maximum history size (defaults to DEFAULT_SESSION_HISTORY_SIZE)
 */
export function addSessionToHistory(sessionData, options = {}) {
  if (!isLocalStorageAvailable()) {
    console.warn("localStorage is not available, cannot save session history");
    return;
  }

  try {
    const { maxSize = DEFAULT_SESSION_HISTORY_SIZE } = options;

    const { groupId, groupName, studentCount, wasConference = true } = sessionData;

    if (!groupId || !groupName) {
      console.warn("Cannot save session to history: missing groupId or groupName", sessionData);
      return;
    }

    // Get current history
    const currentHistory = getSessionHistory();

    // Create new session item with current timestamp
    const newItem = new SessionHistoryItem({
      groupId,
      groupName,
      timestamp: Date.now(),
      studentCount: studentCount || 0,
      wasConference,
    });

    // Remove any prior entry for this group to avoid duplicates, then prepend
    const deduplicated = currentHistory.filter((item) => item.groupId !== groupId);
    const newList = [newItem, ...deduplicated].slice(0, maxSize);

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
