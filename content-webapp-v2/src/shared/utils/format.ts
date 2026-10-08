export function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  const now = new Date();
  const date = new Date(time);
  const diffMs = now.getTime() - time;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  const yesterday = new Date(now.getTime() - day);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sameYear = date.getFullYear() === now.getFullYear();
  const monthDay: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (sameYear) return date.toLocaleDateString([], monthDay);
  return date.toLocaleDateString([], { ...monthDay, year: 'numeric' });
}
