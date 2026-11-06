export interface DateRange {
  start: Date;
  end: Date;
}

export function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function lastNDays(days: number): DateRange {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start, end: new Date() };
}

export function monthToDate(): DateRange {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
}
