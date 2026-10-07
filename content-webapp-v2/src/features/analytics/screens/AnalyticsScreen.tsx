import { Button, Group, Modal, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { BarList, ChartCard, TrendChart } from '../components/Charts';
import chartClasses from '../components/Charts.module.css';
import { FiltersPanel } from '../components/FiltersPanel';
import type { FiltersValue } from '../components/FiltersPanel';
import { StatCards } from '../components/StatCards';
import type { StatCard } from '../components/StatCards';
import { lastNDays, useAnalyticsDashboard, useAnalyticsRange, useAnalyticsRole } from '../hooks/useAnalytics';
import classes from './AnalyticsScreen.module.css';

type AnalyticsTab = 'ivr' | 'conference' | 'organisation';
type ExpandedChart = 'callsByDate' | 'stepDepth' | 'content' | 'teacher' | null;

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

function formatRangeLabel(start: Date | null, end: Date | null): string {
  if (!start || !end) return '';
  const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const year = end.getFullYear();
  return `${day(start)} – ${day(end)} ${year}`;
}

function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function AnalyticsScreen() {
  const { t } = useTranslation();
  const role = useAnalyticsRole();
  const [tab, setTab] = useState<AnalyticsTab>('ivr');
  const [range, setRange] = useState(() => lastNDays(7));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [branch, setBranch] = useState('all');
  const [expanded, setExpanded] = useState<ExpandedChart>(null);
  const [page, setPage] = useState(1);

  const analytics = useAnalyticsRange(role, range);
  const dashboards = useAnalyticsDashboard(role);
  const { stats } = analytics;

  const tenantDashboard = dashboards.tenant.data ?? null;
  const schoolDashboard = dashboards.school.data ?? null;
  const dashboardError = toApiErrorMessage(dashboards.tenant.error ?? dashboards.school.error);
  const analyticsError = toApiErrorMessage(analytics.error);

  const schools = useMemo<SchoolRow[]>(
    () =>
      (tenantDashboard?.schools ?? [])
        .filter((s) => branch === 'all' || (s.id ?? s.name) === branch)
        .map((s) => ({
          id: s.id ?? s.name,
          name: s.name,
          teachers: s.teacher_count,
          students: s.student_count,
          classes: s.class_count,
        })),
    [tenantDashboard, branch],
  );

  const schoolOptions = useMemo(
    () =>
      (tenantDashboard?.schools ?? []).map((s) => ({
        value: s.id ?? s.name,
        label: s.name,
      })),
    [tenantDashboard],
  );

  const filtersInitial: FiltersValue = {
    branch,
    quick: 'last7',
    start: range.start ? toInputDate(range.start) : '',
    end: range.end ? toInputDate(range.end) : '',
  };

  const applyFilters = (value: FiltersValue) => {
    setBranch(value.branch);
    setRange({ start: value.start ? new Date(value.start) : null, end: value.end ? new Date(value.end) : null });
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

  const orgCards: StatCard[] = tenantDashboard
    ? [
        { label: t('analytics.org.totalSchools'), value: String(tenantDashboard.statistics.total_schools) },
        { label: t('analytics.org.totalTeachers'), value: String(tenantDashboard.statistics.total_teachers) },
        { label: t('analytics.org.totalStudents'), value: String(tenantDashboard.statistics.total_students) },
        { label: t('analytics.org.totalClasses'), value: String(tenantDashboard.statistics.total_classes) },
      ]
    : [];

  const schoolCards: StatCard[] = schoolDashboard
    ? [
        { label: t('analytics.org.teachers'), value: String(schoolDashboard.teachers) },
        { label: t('analytics.org.students'), value: String(schoolDashboard.students) },
        { label: t('analytics.org.classes'), value: String(schoolDashboard.classes) },
      ]
    : [];

  const nameCountColumns: DataTableColumn<NameCountRow>[] = [
    { key: 'label', header: t('analytics.expanded.item'), render: (row) => row.label },
    { key: 'count', header: t('analytics.expanded.calls'), render: (row) => String(row.count) },
  ];

  const schoolColumns: DataTableColumn<SchoolRow>[] = [
    { key: 'name', header: t('analytics.org.school'), render: (row) => row.name },
    { key: 'teachers', header: t('analytics.org.teachers'), render: (row) => String(row.teachers) },
    { key: 'students', header: t('analytics.org.students'), render: (row) => String(row.students) },
    { key: 'classes', header: t('analytics.org.classes'), render: (row) => String(row.classes) },
  ];

  const expandedTitle =
    expanded === 'callsByDate'
      ? t('analytics.charts.callsByDate')
      : expanded === 'stepDepth'
        ? t('analytics.charts.stepDepth')
        : expanded === 'content'
          ? t('analytics.charts.contentUsage')
          : t('analytics.charts.callsByTeacher');

  const expandedRows: NameCountRow[] =
    expanded === 'callsByDate'
      ? stats.callsByDate
      : expanded === 'stepDepth'
        ? stats.stepDepth
        : expanded === 'content'
          ? stats.contentUsage
          : stats.callsByTeacher;

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

      <Tabs value={tab} onChange={(v) => setTab((v as AnalyticsTab) ?? 'ivr')}>
        <Tabs.List>
          <Tabs.Tab value="ivr">{t('analytics.tabs.ivr')}</Tabs.Tab>
          <Tabs.Tab value="conference">{t('analytics.tabs.conference')}</Tabs.Tab>
          <Tabs.Tab value="organisation">{t('analytics.tabs.organisation')}</Tabs.Tab>
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
          <div className={chartClasses.row}>
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
          </div>
          <div className={chartClasses.row}>
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
          </div>
          {!analytics.isLoading && stats.totalCalls === 0 && (
            <Text c="dimmed">{t('analytics.noData')}</Text>
          )}
        </Stack>
      )}

      {tab === 'conference' && (
        <Stack gap="md">
          <StatCards
            cards={kpiCards.slice(0, 2).concat(kpiCards.slice(4, 5))}
            loading={analytics.isLoading}
          />
          <Text size="sm" c="dimmed">
            {t('analytics.conference.note')}
          </Text>
          <div className={chartClasses.row}>
            <ChartCard
              title={t('analytics.charts.callsByTeacher')}
              expandLabel={t('analytics.expand')}
              onExpand={() => setExpanded('teacher')}
            >
              <BarList bins={stats.callsByTeacher} compact />
            </ChartCard>
          </div>
          <DataTable<NameCountRow>
            columns={nameCountColumns}
            rows={stats.callsByTeacher}
            getRowId={(row) => row.label}
            loading={analytics.isLoading}
            page={page}
            pageSize={10}
            onPageChange={setPage}
            footerLayout="range"
            emptyMessage={t('analytics.noData')}
          />
        </Stack>
      )}

      {tab === 'organisation' && role === 'tenant' && (
        <Stack gap="md">
          <Title order={3}>{t('analytics.org.overview')}</Title>
          <StatCards cards={orgCards} loading={dashboards.tenant.isLoading} />
          <Title order={4}>{t('analytics.org.schoolsBreakdown')}</Title>
          <DataTable<SchoolRow>
            columns={schoolColumns}
            rows={schools}
            getRowId={(row) => row.id}
            loading={dashboards.tenant.isLoading}
            page={page}
            pageSize={10}
            onPageChange={setPage}
            footerLayout="range"
            emptyMessage={t('analytics.noData')}
          />
        </Stack>
      )}

      {tab === 'organisation' && role === 'school_admin' && (
        <Stack gap="md">
          {schoolDashboard && <Title order={3}>{schoolDashboard.school.name}</Title>}
          <StatCards cards={schoolCards} loading={dashboards.school.isLoading} />
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

      <Modal opened={expanded !== null} onClose={() => setExpanded(null)} title={expandedTitle} size="lg" centered>
        {expanded === 'callsByDate' && <TrendChart bins={stats.callsByDate} />}
        {expanded === 'stepDepth' && <BarList bins={stats.stepDepth} compact={false} />}
        {expanded === 'content' && <BarList bins={stats.contentUsage} compact={false} />}
        {expanded === 'teacher' && <BarList bins={stats.callsByTeacher} compact={false} />}
        <DataTable<NameCountRow>
          columns={nameCountColumns}
          rows={expandedRows}
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
