import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getSchoolDashboard, getTenantDashboard, postAnalytics } from '../api/analytics';
import type { AnalyticsRole } from '../types/analytics.types';
import { analyticsKeys, analyticsRoleSchema } from '../types/analytics.types';
import type { DateRange } from '../utils/analyticsDates';
import { summarizeCalls, summarizeConferences } from '../utils/analyticsSummary';

export { lastNDays, monthToDate, toInputDate } from '../utils/analyticsDates';
export type { DateRange } from '../utils/analyticsDates';
export type { CallSummary, ConferenceSummary, CountBin, DateRow, RecentConference } from '../utils/analyticsSummary';
export { formatClock } from '../utils/analyticsSummary';

export function useAnalyticsRole(): AnalyticsRole | undefined {
  const parsed = analyticsRoleSchema.safeParse(useAuthStore((s) => s.role));
  return parsed.success ? parsed.data : undefined;
}

export function useAnalyticsRange(role: AnalyticsRole, range: DateRange) {
  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();

  const query = useQuery({
    queryKey: analyticsKeys.range(role, startISO, endISO),
    queryFn: () => postAnalytics(role, { start_date: startISO, end_date: endISO }),
  });

  const summary = useMemo(() => {
    const logs = query.data?.data ?? [];
    return { stats: summarizeCalls(logs), conference: summarizeConferences(logs) };
  }, [query.data]);

  return { stats: summary.stats, conference: summary.conference, isLoading: query.isLoading, error: query.error };
}

export function useAnalyticsDashboard(role: AnalyticsRole) {
  const tenant = useQuery({
    queryKey: analyticsKeys.tenantDashboard,
    queryFn: getTenantDashboard,
    enabled: role === 'tenant',
  });
  const school = useQuery({
    queryKey: analyticsKeys.schoolDashboard,
    queryFn: getSchoolDashboard,
    enabled: role === 'school_admin',
  });

  return { tenant, school };
}
