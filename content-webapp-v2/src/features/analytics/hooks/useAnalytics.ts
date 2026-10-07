import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getSchoolDashboard, getTenantDashboard, postAnalytics } from '../api/analytics';
import type { AnalyticsRole, CallLog } from '../types/analytics.types';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export interface CountBin {
  label: string;
  count: number;
}

export interface AnalyticsStats {
  totalCalls: number;
  uniqueUsers: number;
  avgDuration: string;
  medianDuration: string;
  totalDuration: string;
  dropFailPercent: string;
  callsByDate: CountBin[];
  stepDepth: CountBin[];
  contentUsage: CountBin[];
  callsByTeacher: CountBin[];
}

const CONTENT_KEYS = ['content_id', 'audio_id', 'content_name', 'audio_name'];

function parseDurationSeconds(value: CallLog['duration']): number {
  if (value === null || value === undefined || value === '') return 0;
  const seconds = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isNaN(seconds) ? 0 : seconds;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function contentKeyOf(log: CallLog): string | null {
  const record = log as Record<string, unknown>;
  for (const key of CONTENT_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
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

export function summarizeCalls(logs: CallLog[]): AnalyticsStats {
  const empty: AnalyticsStats = {
    totalCalls: 0,
    uniqueUsers: 0,
    avgDuration: '0m 0s',
    medianDuration: '0m 0s',
    totalDuration: '0m',
    dropFailPercent: '0%',
    callsByDate: [],
    stepDepth: [],
    contentUsage: [],
    callsByTeacher: [],
  };
  if (logs.length === 0) return empty;

  const durations = logs.map((log) => parseDurationSeconds(log.duration)).filter((d) => d > 0);
  const totalSeconds = durations.reduce((sum, d) => sum + d, 0);
  const sorted = [...durations].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted[Math.floor(sorted.length / 2)] ?? 0;
  const dropped = logs.filter(
    (log) => parseDurationSeconds(log.duration) === 0 || (log.user_actions?.length ?? 0) <= 1,
  ).length;

  const byDate = new Map<string, number>();
  for (const log of logs) {
    if (!log.created_at) continue;
    const day = new Date(log.created_at);
    if (Number.isNaN(day.getTime())) continue;
    const key = day.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }

  const depthOrder = ['0–1 acts', '2–3 acts', '4–5 acts', '6+ acts'];
  const depthCounts = new Map<string, number>(depthOrder.map((label) => [label, 0]));
  for (const log of logs) {
    const bucket = bucketStepDepth(log.user_actions?.length ?? 0);
    depthCounts.set(bucket, (depthCounts.get(bucket) ?? 0) + 1);
  }

  const contentCounts = new Map<string, number>();
  for (const log of logs) {
    const key = contentKeyOf(log);
    if (key) contentCounts.set(key, (contentCounts.get(key) ?? 0) + 1);
  }

  const teacherCounts = new Map<string, number>();
  for (const log of logs) {
    if (log.phone_number) teacherCounts.set(log.phone_number, (teacherCounts.get(log.phone_number) ?? 0) + 1);
  }

  return {
    totalCalls: logs.length,
    uniqueUsers: new Set(logs.map((log) => log.phone_number).filter(Boolean)).size,
    avgDuration: formatClock(durations.length > 0 ? Math.floor(totalSeconds / durations.length) : 0),
    medianDuration: formatClock(median),
    totalDuration: `${Math.round(totalSeconds / 60)}m`,
    dropFailPercent: `${Math.round((dropped / logs.length) * 100)}%`,
    callsByDate: [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count })),
    stepDepth: depthOrder.map((label) => ({ label, count: depthCounts.get(label) ?? 0 })),
    contentUsage: topCounts([...contentCounts.entries()], 5),
    callsByTeacher: topCounts([...teacherCounts.entries()], 8),
  };
}

export function lastNDays(days: number, now: Date = new Date()): DateRange {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { start, end };
}

export function monthToDate(now: Date = new Date()): DateRange {
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now) };
}

export function useAnalyticsRole(): AnalyticsRole | null {
  return useAuthStore((s) => s.role) as AnalyticsRole | null;
}

export function useAnalyticsRange(role: AnalyticsRole | null, range: DateRange) {
  const status = useAuthStore((s) => s.status);
  const startISO = range.start?.toISOString() ?? null;
  const endISO = range.end?.toISOString() ?? null;
  const enabled = status === 'authenticated' && role !== null && startISO !== null && endISO !== null;

  const query = useQuery({
    queryKey: ['analytics', role, startISO, endISO],
    queryFn: () =>
      postAnalytics(role as AnalyticsRole, {
        start_date: startISO as string,
        end_date: endISO as string,
      }),
    enabled,
  });

  const stats = useMemo(() => summarizeCalls(query.data?.data ?? []), [query.data]);

  return { ...query, stats };
}

export function useAnalyticsDashboard(role: AnalyticsRole | null) {
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && role !== null;

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
