import { Alert, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import type { ApiState } from '@shared/utils/apiState';
import { BarList, ChartCard, ChartSectionHeading, StackedBar } from '../components/Charts';
import { NameCountTable, type NameCountRow } from '../components/NameCountTable';
import { StatCards } from '../components/StatCards';
import type { StatCard } from '../components/StatCards';
import type { AnalyticsRole, SchoolDashboard, TenantDashboard } from '../types/analytics.types';
import classes from './AnalyticsScreen.module.css';

interface SchoolRow {
  id: string;
  name: string;
  teachers: number;
  students: number;
  classes: number;
}

type OrgExpanded = 'orgStudents' | 'orgShare';

export function OrganisationPanel({
  role,
  tenant,
  school,
  branch,
}: {
  role: AnalyticsRole;
  tenant: ApiState<TenantDashboard>;
  school: ApiState<SchoolDashboard>;
  branch: string;
}) {
  return role === 'school_admin' ? <SchoolOrg query={school} /> : <TenantOrg query={tenant} branch={branch} />;
}

function TenantOrg({ query, branch }: { query: ApiState<TenantDashboard>; branch: string }) {
  const { t } = useTranslation();
  if (query.status === 'loading') return <Text c="dimmed">{t('common.loading')}</Text>;
  if (query.status === 'error') return <Alert>{query.error.message}</Alert>;
  return <TenantOrgView dashboard={query.data} branch={branch} />;
}

function TenantOrgView({ dashboard, branch }: { dashboard: TenantDashboard; branch: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<OrgExpanded | 'closed'>('closed');

  const schools = useMemo<SchoolRow[]>(
    () =>
      dashboard.schools
        .filter((s) => branch === 'all' || s.id === branch)
        .map((s) => ({
          id: s.id,
          name: s.name,
          teachers: s.teacher_count,
          students: s.student_count,
          classes: s.class_count,
        })),
    [dashboard, branch],
  );

  const studentBins = useMemo<NameCountRow[]>(
    () => schools.map((s) => ({ label: s.name, count: s.students })).sort((a, b) => b.count - a.count),
    [schools],
  );

  const shareBins = useMemo<NameCountRow[]>(() => {
    const rest = studentBins.slice(3).reduce((sum, b) => sum + b.count, 0);
    if (rest === 0) return studentBins;
    return [...studentBins.slice(0, 3), { label: t('analytics.org.other'), count: rest }];
  }, [studentBins, t]);

  const cards: StatCard[] = [
    { label: t('analytics.org.schools'), value: String(dashboard.statistics.total_schools) },
    { label: t('analytics.org.teachers'), value: dashboard.statistics.total_teachers.toLocaleString() },
    { label: t('analytics.org.students'), value: dashboard.statistics.total_students.toLocaleString() },
    { label: t('analytics.org.classes'), value: String(dashboard.statistics.total_classes) },
  ];

  const schoolColumns: DataTableColumn<SchoolRow>[] = [
    { key: 'name', header: t('analytics.org.school'), render: (row) => row.name },
    { key: 'teachers', header: t('analytics.org.teachers'), render: (row) => String(row.teachers) },
    { key: 'students', header: t('analytics.org.students'), render: (row) => String(row.students) },
    { key: 'classes', header: t('analytics.org.classes'), render: (row) => String(row.classes) },
  ];

  const expandedTitles: Record<OrgExpanded, string> = {
    orgStudents: t('analytics.org.studentsBySchool'),
    orgShare: t('analytics.org.studentShare'),
  };

  const expandedRows: Record<OrgExpanded, NameCountRow[]> = {
    orgStudents: studentBins,
    orgShare: shareBins,
  };

  const expandedCharts = {
    orgStudents: <BarList bins={studentBins} compact={false} />,
    orgShare: <StackedBar bins={shareBins} />,
  };

  return (
    <Stack gap="md">
      <StatCards cards={cards} loading={false} />
      <ChartSectionHeading label={t('analytics.org.activityMix')} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <ChartCard
          title={t('analytics.org.studentsBySchool')}
          expandLabel={t('analytics.expand')}
          onExpand={() => setExpanded('orgStudents')}
        >
          <BarList bins={studentBins} compact />
        </ChartCard>
        <ChartCard
          title={t('analytics.org.studentShare')}
          expandLabel={t('analytics.expand')}
          onExpand={() => setExpanded('orgShare')}
        >
          <StackedBar bins={shareBins} />
        </ChartCard>
      </SimpleGrid>
      <Title order={4}>{t('analytics.org.schools')}</Title>
      <div className={classes.preview}>
        <DataTable<SchoolRow>
          columns={schoolColumns}
          rows={schools}
          getRowId={(row) => row.id}
          loading={false}
          page={1}
          pageSize={Math.max(schools.length, 1)}
          emptyMessage={t('analytics.noData')}
        />
      </div>
      {expanded !== 'closed' && (
        <Modal opened onClose={() => setExpanded('closed')} title={expandedTitles[expanded]} size="lg" centered>
          {expandedCharts[expanded]}
          <NameCountTable rows={expandedRows[expanded]} />
        </Modal>
      )}
    </Stack>
  );
}

function SchoolOrg({ query }: { query: ApiState<SchoolDashboard> }) {
  const { t } = useTranslation();
  if (query.status === 'loading') return <Text c="dimmed">{t('common.loading')}</Text>;
  if (query.status === 'error') return <Alert>{query.error.message}</Alert>;
  return (
    <Stack gap="md">
      <Title order={3}>{query.data.school.name}</Title>
      <StatCards
        cards={[
          { label: t('analytics.org.teachers'), value: String(query.data.teachers) },
          { label: t('analytics.org.students'), value: String(query.data.students) },
          { label: t('analytics.org.classes'), value: String(query.data.classes) },
        ]}
        loading={false}
      />
    </Stack>
  );
}
