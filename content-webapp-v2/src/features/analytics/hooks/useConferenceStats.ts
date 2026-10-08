import { useMemo } from 'react';
import type { CallLog } from '../types/analytics.types';
import { formatClock, parseDurationSeconds } from './useAnalytics';
import type { CountBin } from './useAnalytics';

export interface RecentConference {
  id: string;
  date: string;
  teacher: string;
  duration: string;
}

export interface ConferenceStats {
  durationTrend: CountBin[];
  recent: RecentConference[];
}

export function summarizeConferences(logs: CallLog[]): ConferenceStats {
  const dated = logs
    .filter((log) => log.created_at && !Number.isNaN(new Date(log.created_at).getTime()))
    .map((log, index) => ({ log, index, time: new Date(log.created_at) }))
    .sort((a, b) => b.time.getTime() - a.time.getTime());

  const secondsByDay = new Map<string, number[]>();
  for (const { log, time } of dated) {
    const seconds = parseDurationSeconds(log.duration);
    if (seconds <= 0) continue;
    const day = time.toISOString().slice(0, 10);
    const existing = secondsByDay.get(day);
    if (existing === undefined) {
      secondsByDay.set(day, [seconds]);
      continue;
    }
    existing.push(seconds);
  }

  return {
    durationTrend: [...secondsByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, values]) => ({
        label,
        count: Math.floor(values.reduce((sum, v) => sum + v, 0) / values.length),
      })),
    recent: dated.slice(0, 10).map(({ log, index, time }) => ({
      id: `${index}-${time.toISOString()}`,
      date: `${time.getUTCMonth() + 1}/${time.getUTCDate()}`,
      teacher: log.phone_number || '—',
      duration: formatClock(parseDurationSeconds(log.duration)),
    })),
  };
}

export function useConferenceStats(logs: CallLog[] | undefined) {
  return useMemo(() => summarizeConferences(logs ?? []), [logs]);
}
