import type { CallLog } from '../types/analytics.types';

export interface CountBin {
  label: string;
  count: number;
}

export interface DateRow {
  date: string;
  calls: number;
  uniqueUsers: number;
  avgDuration: string;
  dropPercent: string;
}

export type RecentConference = ReturnType<typeof summarizeConferences>['recent'][number];

export type CallSummary = ReturnType<typeof summarizeCalls>;

export type ConferenceSummary = ReturnType<typeof summarizeConferences>;

const CONTENT_KEYS = ['content_id', 'audio_id', 'content_name', 'audio_name'] as const;

const DEPTH_LABELS = ['0–1 acts', '2–3 acts', '4–5 acts', '6+ acts'];

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const percent = (part: number, whole: number) => `${Math.round((part / Math.max(whole, 1)) * 100)}%`;

const contentKeyOf = (log: CallLog) => CONTENT_KEYS.map((key) => log[key]).find((value) => value !== '');

const phonesOf = (logs: CallLog[]) => logs.map((log) => log.phone_number).filter(Boolean);

const callDurations = (logs: CallLog[]) => logs.map((log) => log.duration).filter((d) => d > 0);

const countDropped = (logs: CallLog[]) => logs.filter((log) => log.duration === 0 || log.user_actions.length <= 1).length;

const averageDuration = (durations: number[]) => Math.floor(sum(durations) / Math.max(durations.length, 1));

const medianDuration = (durations: number[]) =>
  [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)] ?? 0;

const topCounts = (keys: string[], limit: number): CountBin[] =>
  [...Map.groupBy(keys, (key) => key)]
    .map(([label, group]) => ({ label, count: group.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

const dayOf = (log: CallLog) => log.created_at.toISOString().slice(0, 10);

const groupByDate = (logs: CallLog[]) => [...Map.groupBy(logs, dayOf)].sort(([a], [b]) => a.localeCompare(b));

export function summarizeConferences(logs: CallLog[]) {
  const newestFirst = [...logs].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const durationTrend = groupByDate(newestFirst.filter((log) => log.duration > 0)).map(([label, dayLogs]) => ({
    label,
    count: averageDuration(dayLogs.map((log) => log.duration)),
  }));
  const recent = newestFirst.slice(0, 10).map((log, index) => ({
    id: `${index}-${log.created_at.toISOString()}`,
    date: `${log.created_at.getUTCMonth() + 1}/${log.created_at.getUTCDate()}`,
    teacher: log.phone_number,
    duration: formatClock(log.duration),
  }));
  return { durationTrend, recent };
}

const summarizeDate = (date: string, logs: CallLog[]): DateRow => ({
  date,
  calls: logs.length,
  uniqueUsers: new Set(phonesOf(logs)).size,
  avgDuration: formatClock(averageDuration(callDurations(logs))),
  dropPercent: percent(countDropped(logs), logs.length),
});

export function summarizeCalls(logs: CallLog[]) {
  const durations = callDurations(logs);
  const byDate = groupByDate(logs);
  const byDepth = Map.groupBy(logs, (log) => Math.min(Math.floor(log.user_actions.length / 2), 3));

  return {
    totalCalls: logs.length,
    uniqueUsers: new Set(phonesOf(logs)).size,
    avgDuration: formatClock(averageDuration(durations)),
    medianDuration: formatClock(medianDuration(durations)),
    totalDuration: `${Math.round(sum(durations) / 60)}m`,
    dropFailPercent: percent(countDropped(logs), logs.length),
    callsByDate: byDate.map(([label, dayLogs]) => ({ label, count: dayLogs.length })),
    dateRows: byDate.map(([date, dayLogs]) => summarizeDate(date, dayLogs)),
    stepDepth: DEPTH_LABELS.map((label, depth) => ({ label, count: byDepth.get(depth)?.length ?? 0 })),
    contentUsage: topCounts(logs.map(contentKeyOf).filter((key) => key !== undefined), 5),
    callsByTeacher: topCounts(phonesOf(logs), 8),
  };
}
