// Tiny classNames joiner (no dependency). Filters falsy values.
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}
