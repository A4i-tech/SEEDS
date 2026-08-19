/** Formats seconds as M:SS */
export function formatSeconds(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return "0:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
