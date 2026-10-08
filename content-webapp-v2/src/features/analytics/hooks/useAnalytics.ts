import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getSchoolDashboard, getTenantDashboard, postAnalytics } from '../api/analytics';
import { toApiState } from '@shared/utils/apiState';
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

  const state = toApiState(query);
  const logs = state.status === 'done' ? state.data.data : [];
  const stats = summarizeCalls(logs);
  const conference = summarizeConferences(logs);

  return { state, stats, conference };
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

  return { tenant: toApiState(tenant), school: toApiState(school) };
}
