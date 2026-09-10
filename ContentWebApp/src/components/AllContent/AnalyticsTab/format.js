// Formatting helpers shared by the analytics sections.

/** Seconds -> "Xm Ys" (or "Xh Ym" past an hour). null/undefined -> "—". */
export const formatDuration = (totalSeconds) => {
  if (totalSeconds === null || totalSeconds === undefined) return "—";
  const s = Math.round(Number(totalSeconds));
  if (Number.isNaN(s)) return "—";
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

/** Fraction (0..1) -> "NN.N%". null/undefined -> "—". */
export const formatPercent = (fraction) => {
  if (fraction === null || fraction === undefined) return "—";
  const n = Number(fraction);
  if (Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
};

/** Number with graceful fallback. */
export const formatNumber = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : n.toLocaleString();
};
