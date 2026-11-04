import { useTranslation } from 'react-i18next';
import { LoadError } from '@shared/components/LoadError';
import type { ApiState } from '@shared/utils/apiState';
import { StatCards } from '@features/analytics/components/StatCards';
import type { AnalyticsRole } from '@features/analytics/types/analytics.types';
import { useAnalyticsDashboard, useAnalyticsRole } from '@features/analytics/hooks/useAnalytics';

function Counts<T>({ state, pick }: { state: ApiState<T>; pick: (data: T) => Record<string, number> }) {
  const { t } = useTranslation();
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'loading') return <StatCards cards={[]} loading />;
  const cards = Object.entries(pick(state.data)).map(([label, value]) => ({
    label: t(`analytics.org.${label}`),
    value: value.toLocaleString(),
  }));
  return <StatCards cards={cards} loading={false} />;
}

export function RegistrationCounts() {
  const role = useAnalyticsRole();
  return role && <RoleCounts role={role} />;
}

function RoleCounts({ role }: { role: AnalyticsRole }) {
  const { tenant, school } = useAnalyticsDashboard(role);
  return (
    <>
      {role === 'tenant' && (
        <Counts
          state={tenant}
          pick={({ statistics }) => ({
            schools: statistics.total_schools,
            teachers: statistics.total_teachers,
            students: statistics.total_students,
            classes: statistics.total_classes,
          })}
        />
      )}
      {role === 'school_admin' && <Counts state={school} pick={({ teachers, students, classes }) => ({ teachers, students, classes })} />}
    </>
  );
}
