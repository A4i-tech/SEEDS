/**
 * Format a duration in seconds as "Xm Ys" (or "Xh Ym" above an hour).
 * @param {number|null} totalSeconds
 * @returns {string}
 */
export const formatSeconds = (totalSeconds) => {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
    return "—";
  }
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
};

/**
 * Format a 0..1 rate as a percentage string.
 * @param {number|null} rate
 * @returns {string}
 */
export const formatRate = (rate) => {
  if (rate === null || rate === undefined || isNaN(rate)) {
    return "—";
  }
  return `${Math.round(rate * 1000) / 10}%`;
};
