import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getSchoolDashboard, getTenantDashboard, postAnalytics } from '../api/analytics';
import type { AnalyticsRole, CallLog } from '../types/analytics.types';
import { analyticsRoleSchema } from '../types/analytics.types';

export interface DateRange {
  start: Date;
  end: Date;
}

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

interface AnalyticsStats {
  totalCalls: number;
  uniqueUsers: number;
  avgDuration: string;
  medianDuration: string;
  totalDuration: string;
  dropFailPercent: string;
  callsByDate: CountBin[];
  dateRows: DateRow[];
  stepDepth: CountBin[];
  contentUsage: CountBin[];
  callsByTeacher: CountBin[];
}

const CONTENT_KEYS = ['content_id', 'audio_id', 'content_name', 'audio_name'] as const;

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function contentKeyOf(log: CallLog): string {
  for (const key of CONTENT_KEYS) {
    const value: string = log[key];
    if (value.length > 0) return value;
  }
  return '';
}

function appendLog(byDate: Map<string, CallLog[]>, key: string, log: CallLog): void {
  const existing = byDate.get(key);
  if (existing === undefined) {
    byDate.set(key, [log]);
    return;
  }
  existing.push(log);
}

function incrementCount(counts: Map<string, number>, key: string): void {
  const existing = counts.get(key);
  if (existing === undefined) {
    counts.set(key, 1);
    return;
  }
  counts.set(key, existing + 1);
}

function bucketStepDepth(actions: number): string {
  if (actions <= 1) return '0–1 acts';
  if (actions <= 3) return '2–3 acts';
  if (actions <= 5) return '4–5 acts';
  return '6+ acts';
}

function topCounts(entries: Array<[string, number]>, limit: number): CountBin[] {
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function isDropped(log: CallLog): boolean {
  return log.duration === 0 || log.user_actions.length <= 1;
}

function averageDuration(total: number, count: number): number {
  if (count === 0) return 0;
  return Math.floor(total / count);
}

function medianOfSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function summarizeDate(date: string, logs: CallLog[]): DateRow {
  const durations = logs.map((log) => log.duration).filter((d) => d > 0);
  const total = durations.reduce((sum, d) => sum + d, 0);
  return {
    date,
    calls: logs.length,
    uniqueUsers: new Set(logs.map((log) => log.phone_number).filter(Boolean)).size,
    avgDuration: formatClock(averageDuration(total, durations.length)),
    dropPercent: `${Math.round((logs.filter(isDropped).length / logs.length) * 100)}%`,
  };
}

export function summarizeCalls(logs: CallLog[]): AnalyticsStats {
  const empty: AnalyticsStats = {
    totalCalls: 0,
    uniqueUsers: 0,
    avgDuration: '0m 0s',
    medianDuration: '0m 0s',
    totalDuration: '0m',
    dropFailPercent: '0%',
    callsByDate: [],
    dateRows: [],
    stepDepth: [],
    contentUsage: [],
    callsByTeacher: [],
  };
  if (logs.length === 0) return empty;

  const durations = logs.map((log) => log.duration).filter((d) => d > 0);
  const totalSeconds = durations.reduce((sum, d) => sum + d, 0);
  const sorted = [...durations].sort((a, b) => a - b);
  const median = medianOfSorted(sorted);
  const dropped = logs.filter(isDropped).length;

  const byDate = new Map<string, CallLog[]>();
  for (const log of logs) {
    if (!log.created_at) continue;
    const day = new Date(log.created_at);
    if (Number.isNaN(day.getTime())) continue;
    const key = day.toISOString().slice(0, 10);
    appendLog(byDate, key, log);
  }
  const sortedDates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  const depthOrder = ['0–1 acts', '2–3 acts', '4–5 acts', '6+ acts'];
  const depthCounts = new Map<string, number>(depthOrder.map((label) => [label, 0]));
  for (const log of logs) {
    incrementCount(depthCounts, bucketStepDepth(log.user_actions.length));
  }

  const contentCounts = new Map<string, number>();
  for (const log of logs) {
    const key = contentKeyOf(log);
    if (key) incrementCount(contentCounts, key);
  }

  const teacherCounts = new Map<string, number>();
  for (const log of logs) {
    if (log.phone_number) incrementCount(teacherCounts, log.phone_number);
  }

  return {
    totalCalls: logs.length,
    uniqueUsers: new Set(logs.map((log) => log.phone_number).filter(Boolean)).size,
    avgDuration: formatClock(averageDuration(totalSeconds, durations.length)),
    medianDuration: formatClock(median),
    totalDuration: `${Math.round(totalSeconds / 60)}m`,
    dropFailPercent: `${Math.round((dropped / logs.length) * 100)}%`,
    callsByDate: sortedDates.map(([label, dayLogs]) => ({ label, count: dayLogs.length })),
    dateRows: sortedDates.map(([date, dayLogs]) => summarizeDate(date, dayLogs)),
    stepDepth: [...depthCounts].map(([label, count]) => ({ label, count })),
    contentUsage: topCounts([...contentCounts.entries()], 5),
    callsByTeacher: topCounts([...teacherCounts.entries()], 8),
  };
}

export function lastNDays(days: number, now: Date = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { start, end };
}

export function monthToDate(now: Date = new Date()): { start: Date; end: Date } {
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now) };
}

export function useAnalyticsRole(): AnalyticsRole | undefined {
  const raw = useAuthStore((s) => s.role);
  const parsed = analyticsRoleSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  return parsed.data;
}

export function useAnalyticsRange(role: AnalyticsRole | undefined, range: DateRange) {
  const status = useAuthStore((s) => s.status);
  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();
  const enabled = status === 'authenticated' && role !== undefined;

  const query = useQuery({
    queryKey: ['analytics', role, startISO, endISO],
    queryFn: () => {
      if (role === undefined) throw new Error('Analytics query ran without role');
      return postAnalytics(role, {
        start_date: startISO,
        end_date: endISO,
      });
    },
    enabled,
  });

  const stats = useMemo(() => summarizeCalls(query.data?.data ?? []), [query.data]);

  return { ...query, stats };
}

export function useAnalyticsDashboard(role: AnalyticsRole | undefined) {
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && role !== undefined;

  const tenant = useQuery({
    queryKey: ['analytics', 'tenant-dashboard'],
    queryFn: getTenantDashboard,
    enabled: enabled && role === 'tenant',
  });
  const school = useQuery({
    queryKey: ['analytics', 'school-dashboard'],
    queryFn: getSchoolDashboard,
    enabled: enabled && role === 'school_admin',
  });

  return { tenant, school };
}
