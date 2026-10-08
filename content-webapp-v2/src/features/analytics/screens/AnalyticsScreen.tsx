import { Button, Group, Modal, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { BarList, ChartCard, StackedBar, TrendChart } from '../components/Charts';
import { FiltersPanel } from '../components/FiltersPanel';
import type { FiltersValue } from '../components/FiltersPanel';
import { StatCards } from '../components/StatCards';
import type { StatCard } from '../components/StatCards';
import type { DateRange, DateRow } from '../hooks/useAnalytics';
import { useConferenceStats } from '../hooks/useConferenceStats';
import type { RecentConference } from '../hooks/useConferenceStats';
import { lastNDays, useAnalyticsDashboard, useAnalyticsRange, useAnalyticsRole } from '../hooks/useAnalytics';
import classes from './AnalyticsScreen.module.css';

type AnalyticsTab = 'ivr' | 'conference' | 'organisation';
type ConferenceChart = 'byDate' | 'byTeacher' | 'classSize' | 'durationTrend';
type ExpandedChart = 'callsByDate' | 'stepDepth' | 'content' | 'teacher' | 'orgStudents' | 'orgShare';

const ANALYTICS_TABS: AnalyticsTab[] = ['ivr', 'conference', 'organisation'];

function toAnalyticsTab(value: unknown): AnalyticsTab {
  if (typeof value !== 'string') return 'ivr';
  const found = ANALYTICS_TABS.find((tab) => tab === value);
  if (found === undefined) return 'ivr';
  return found;
}

interface NameCountRow {
  label: string;
  count: number;
}

interface SchoolRow {
  id: string;
  name: string;
  teachers: number;
  students: number;
  classes: number;
}

function formatRangeLabel(start: Date | undefined, end: Date | undefined): string {
  if (!start || !end) return '';
  const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const year = end.getFullYear();
  return `${day(start)} – ${day(end)} ${year}`;
}

function toInputDateOrEmpty(date: Date | undefined): string {
  if (date === undefined) return '';
  return toInputDate(date);
}

function parseInputDate(value: string): Date | undefined {
  if (!value) return undefined;
  return new Date(value);
}

function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function AnalyticsScreen() {
  const { t } = useTranslation();
  const role = useAnalyticsRole();
  const [tab, setTab] = useState<AnalyticsTab>('ivr');
  const [range, setRange] = useState<DateRange>(() => lastNDays(7));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [branch, setBranch] = useState('all');
  const [expanded, setExpanded] = useState<ExpandedChart | undefined>(undefined);
  const [confExpanded, setConfExpanded] = useState<ConferenceChart | undefined>(undefined);
  const [page, setPage] = useState(1);

  const analytics = useAnalyticsRange(role, range);
  const dashboards = useAnalyticsDashboard(role);
  const { stats } = analytics;
  const conference = useConferenceStats(analytics.data?.data);

  const tenantDashboard = dashboards.tenant.data;
  const schoolDashboard = dashboards.school.data;
  const dashboardError = toApiErrorMessage(dashboards.tenant.error ?? dashboards.school.error);
  const analyticsError = toApiErrorMessage(analytics.error);

  const schools = useMemo<SchoolRow[]>(
    () =>
      (tenantDashboard?.schools ?? [])
        .filter((s) => branch === 'all' || (s.id || s.name) === branch)
        .map((s) => ({
          id: s.id || s.name,
          name: s.name,
          teachers: s.teacher_count,
          students: s.student_count,
          classes: s.class_count,
        })),
    [tenantDashboard, branch],
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

  const schoolOptions = useMemo(
    () =>
      (tenantDashboard?.schools ?? []).map((s) => ({
        value: s.id || s.name,
        label: s.name,
      })),
    [tenantDashboard],
  );

  const filtersInitial: FiltersValue = {
    branch,
    quick: 'last7',
    start: toInputDateOrEmpty(range.start),
    end: toInputDateOrEmpty(range.end),
  };

  const applyFilters = (value: FiltersValue) => {
    setBranch(value.branch);
    setRange({ start: parseInputDate(value.start), end: parseInputDate(value.end) });
    setPage(1);
    setFiltersOpen(false);
  };

  if (!role) {
    return (
      <Stack gap="md">
        <Title order={2}>{t('analytics.title')}</Title>
        <Text c="dimmed">{t('analytics.noRole')}</Text>
      </Stack>
    );
  }

  const kpiCards: StatCard[] = [
    { label: t('analytics.kpi.totalCalls'), value: String(stats.totalCalls) },
    { label: t('analytics.kpi.uniqueUsers'), value: String(stats.uniqueUsers) },
    { label: t('analytics.kpi.avgDuration'), value: stats.avgDuration },
    { label: t('analytics.kpi.median'), value: stats.medianDuration },
    { label: t('analytics.kpi.totalDuration'), value: stats.totalDuration },
    { label: t('analytics.kpi.dropFail'), value: stats.dropFailPercent },
  ];

  const orgCards = (): StatCard[] => {
    if (!tenantDashboard) return [];
    return [
      { label: t('analytics.org.schools'), value: String(tenantDashboard.statistics.total_schools) },
      { label: t('analytics.org.teachers'), value: tenantDashboard.statistics.total_teachers.toLocaleString() },
      { label: t('analytics.org.students'), value: tenantDashboard.statistics.total_students.toLocaleString() },
      { label: t('analytics.org.classes'), value: String(tenantDashboard.statistics.total_classes) },
    ];
  };

  const schoolCards = (): StatCard[] => {
    if (!schoolDashboard) return [];
    return [
      { label: t('analytics.org.teachers'), value: String(schoolDashboard.teachers) },
      { label: t('analytics.org.students'), value: String(schoolDashboard.students) },
      { label: t('analytics.org.classes'), value: String(schoolDashboard.classes) },
    ];
  };

  const nameCountColumns: DataTableColumn<NameCountRow>[] = [
    { key: 'label', header: t('analytics.expanded.item'), render: (row) => row.label },
    { key: 'count', header: t('analytics.expanded.calls'), render: (row) => String(row.count) },
  ];

  const dateColumns: DataTableColumn<DateRow>[] = [
    {
      key: 'date',
      header: t('analytics.dateColumns.date'),
      render: (row) => new Date(row.date).toLocaleDateString('en-US', { timeZone: 'UTC' }),
    },
    { key: 'calls', header: t('analytics.dateColumns.calls'), render: (row) => String(row.calls) },
    { key: 'users', header: t('analytics.dateColumns.uniqueUsers'), render: (row) => String(row.uniqueUsers) },
    { key: 'avg', header: t('analytics.dateColumns.avgDuration'), render: (row) => row.avgDuration },
    { key: 'drop', header: t('analytics.dateColumns.dropPercent'), render: (row) => row.dropPercent },
  ];

  const conferenceColumns: DataTableColumn<RecentConference>[] = [
    { key: 'date', header: t('analytics.conference.columns.date'), render: (row) => row.date },
    { key: 'teacher', header: t('analytics.conference.columns.teacher'), render: (row) => row.teacher },
    { key: 'students', header: t('analytics.conference.columns.students'), render: () => '—' },
    { key: 'duration', header: t('analytics.conference.columns.duration'), render: (row) => row.duration },
    { key: 'branch', header: t('analytics.conference.columns.branch'), render: () => '—' },
  ];

  const conferenceCards: StatCard[] = [
    { label: t('analytics.conference.totalConferences'), value: String(stats.totalCalls) },
    { label: t('analytics.kpi.avgDuration'), value: stats.avgDuration },
    { label: t('analytics.conference.avgClassSize'), value: '—' },
    { label: t('analytics.conference.uniqueTeachers'), value: String(stats.uniqueUsers) },
  ];

  const schoolColumns: DataTableColumn<SchoolRow>[] = [
    { key: 'name', header: t('analytics.org.school'), render: (row) => row.name },
    { key: 'teachers', header: t('analytics.org.teachers'), render: (row) => String(row.teachers) },
    { key: 'students', header: t('analytics.org.students'), render: (row) => String(row.students) },
    { key: 'classes', header: t('analytics.org.classes'), render: (row) => String(row.classes) },
  ];

  const expandedTitles: Record<ExpandedChart, string> = {
    callsByDate: t('analytics.charts.callsByDate'),
    stepDepth: t('analytics.charts.stepDepth'),
    content: t('analytics.charts.contentUsage'),
    teacher: t('analytics.charts.callsByTeacher'),
    orgStudents: t('analytics.org.studentsBySchool'),
    orgShare: t('analytics.org.studentShare'),
  };

  const expandedTitle = (): string | undefined => {
    if (expanded === undefined) return undefined;
    return expandedTitles[expanded];
  };

  const expandedRows = (): NameCountRow[] => {
    if (expanded === undefined) return [];
    const rows: Record<ExpandedChart, NameCountRow[]> = {
      callsByDate: stats.callsByDate,
      stepDepth: stats.stepDepth,
      content: stats.contentUsage,
      teacher: stats.callsByTeacher,
      orgStudents: studentBins,
      orgShare: shareBins,
    };
    return rows[expanded];
  };

  const confTitle = (): string | undefined => {
    if (confExpanded === undefined) return undefined;
    return t(`analytics.conference.${confExpanded}`);
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" className={classes.header}>
        <div>
          <Title order={2}>{t('analytics.title')}</Title>
          <Text c="dimmed">{t('analytics.description')}</Text>
        </div>
        <Group gap="sm" align="center">
          {range.start && range.end && (
            <Text size="sm" c="dimmed">
              {t('analytics.showing', { range: formatRangeLabel(range.start, range.end) })}
            </Text>
          )}
          <Button className={classes.filtersButton} onClick={() => setFiltersOpen(true)}>
            {t('analytics.filters')}
          </Button>
        </Group>
      </Group>

      <Tabs value={tab} onChange={(v) => setTab(toAnalyticsTab(v))}>
        <Tabs.List className={classes.tabList}>
          <Tabs.Tab value="ivr" className={classes.tab}>{t('analytics.tabs.ivr')}</Tabs.Tab>
          <Tabs.Tab value="conference" className={classes.tab}>{t('analytics.tabs.conference')}</Tabs.Tab>
          <Tabs.Tab value="organisation" className={classes.tab}>{t('analytics.tabs.organisation')}</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {analyticsError && (
        <Text c="red" role="alert">
          {analyticsError}
        </Text>
      )}
      {dashboardError && (
        <Text c="red" role="alert">
          {dashboardError}
        </Text>
      )}

      {tab === 'ivr' && (
        <Stack gap="md">
          <StatCards cards={kpiCards} loading={analytics.isLoading} />
          <Group gap="xs" align="center">
            <Text size="sm" fw={700} className={classes.eyebrow}>
              {t('analytics.chartsLabel')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('analytics.chartsHint')}
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ChartCard
              title={t('analytics.charts.callsByDate')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setExpanded('callsByDate')}
            >
              <TrendChart bins={stats.callsByDate} />
            </ChartCard>
            <ChartCard
              title={t('analytics.charts.stepDepth')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setExpanded('stepDepth')}
            >
              <BarList bins={stats.stepDepth} compact />
            </ChartCard>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ChartCard
              title={t('analytics.charts.contentUsage')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setExpanded('content')}
            >
              <BarList bins={stats.contentUsage} compact />
            </ChartCard>
            <ChartCard
              title={t('analytics.charts.callsByTeacher')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setExpanded('teacher')}
            >
              <BarList bins={stats.callsByTeacher} compact />
            </ChartCard>
          </SimpleGrid>
          <Title order={4}>{t('analytics.callsByDatePreview')}</Title>
          <div className={classes.preview}>
            <DataTable<DateRow>
              columns={dateColumns}
              rows={stats.dateRows}
              getRowId={(row) => row.date}
              loading={analytics.isLoading}
              page={page}
              pageSize={10}
              onPageChange={setPage}
              footerLayout="range"
              emptyMessage={t('analytics.noData')}
            />
          </div>
        </Stack>
      )}

      {tab === 'conference' && (
        <Stack gap="md">
          <StatCards cards={conferenceCards} loading={analytics.isLoading} />
          <Group gap="xs" align="center">
            <Text size="sm" fw={700} className={classes.eyebrow}>
              {t('analytics.chartsLabel')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('analytics.chartsHint')}
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ChartCard
              title={t('analytics.conference.byDate')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setConfExpanded('byDate')}
            >
              <TrendChart bins={stats.callsByDate} />
            </ChartCard>
            <ChartCard
              title={t('analytics.conference.byTeacher')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setConfExpanded('byTeacher')}
            >
              <BarList bins={stats.callsByTeacher} compact />
            </ChartCard>
            <ChartCard
              title={t('analytics.conference.classSize')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setConfExpanded('classSize')}
            >
              <Text c="dimmed">{t('analytics.conference.unavailable')}</Text>
            </ChartCard>
            <ChartCard
              title={t('analytics.conference.durationTrend')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setConfExpanded('durationTrend')}
            >
              <TrendChart bins={conference.durationTrend} hideAxis />
            </ChartCard>
          </SimpleGrid>
          <Title order={4}>{t('analytics.conference.recent')}</Title>
          <div className={classes.preview}>
            <DataTable<RecentConference>
              columns={conferenceColumns}
              rows={conference.recent}
              getRowId={(row) => row.id}
              loading={analytics.isLoading}
              page={page}
              pageSize={10}
              onPageChange={setPage}
              footerLayout="range"
              emptyMessage={t('analytics.noData')}
            />
          </div>
        </Stack>
      )}

      {tab === 'organisation' && role === 'tenant' && (
        <Stack gap="md">
          <StatCards cards={orgCards()} loading={dashboards.tenant.isLoading} />
          <Group gap="xs" align="center">
            <Text size="sm" fw={700} className={classes.eyebrow}>
              {t('analytics.org.activityMix')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('analytics.chartsHint')}
            </Text>
          </Group>
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
              loading={dashboards.tenant.isLoading}
              page={1}
              pageSize={Math.max(schools.length, 1)}
              footerLayout="range"
              emptyMessage={t('analytics.noData')}
            />
          </div>
        </Stack>
      )}

      {tab === 'organisation' && role === 'school_admin' && (
        <Stack gap="md">
          {schoolDashboard && <Title order={3}>{schoolDashboard.school.name}</Title>}
          <StatCards cards={schoolCards()} loading={dashboards.school.isLoading} />
        </Stack>
      )}

      <Modal opened={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('analytics.filtersPanel.title')} centered>
        <FiltersPanel
          schools={schoolOptions}
          showBranch={role === 'tenant'}
          initial={filtersInitial}
          loading={analytics.isLoading}
          onApply={applyFilters}
        />
      </Modal>

      <Modal
        opened={confExpanded !== undefined}
        onClose={() => setConfExpanded(undefined)}
        title={confTitle()}
        size="lg"
        centered
      >
        {confExpanded === 'byDate' && <TrendChart bins={stats.callsByDate} />}
        {confExpanded === 'byTeacher' && <BarList bins={stats.callsByTeacher} compact={false} />}
        {confExpanded === 'classSize' && <Text c="dimmed">{t('analytics.conference.unavailable')}</Text>}
        {confExpanded === 'durationTrend' && <TrendChart bins={conference.durationTrend} />}
      </Modal>

      <Modal opened={expanded !== undefined} onClose={() => setExpanded(undefined)} title={expandedTitle()} size="lg" centered>
        {expanded === 'callsByDate' && <TrendChart bins={stats.callsByDate} />}
        {expanded === 'stepDepth' && <BarList bins={stats.stepDepth} compact={false} />}
        {expanded === 'content' && <BarList bins={stats.contentUsage} compact={false} />}
        {expanded === 'teacher' && <BarList bins={stats.callsByTeacher} compact={false} />}
        {expanded === 'orgStudents' && <BarList bins={studentBins} compact={false} />}
        {expanded === 'orgShare' && <StackedBar bins={shareBins} />}
        <DataTable<NameCountRow>
          columns={nameCountColumns}
          rows={expandedRows()}
          getRowId={(row) => row.label}
          loading={false}
          page={page}
          pageSize={10}
          onPageChange={setPage}
          footerLayout="range"
          emptyMessage={t('analytics.noData')}
        />
      </Modal>
    </Stack>
  );
}
