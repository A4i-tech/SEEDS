/**
 * Formats seconds as M:SS or MM:SS
 * @param {number} seconds - The time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Formats seconds as MM:SS (always 2-digit minutes)
 * @param {number} seconds - The time in seconds
 * @returns {string} Formatted time string
 */
export function formatTimeWithLeadingZero(seconds) {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
