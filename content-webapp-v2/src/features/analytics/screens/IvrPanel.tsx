import { Alert, Modal, SimpleGrid, Stack, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { BarList, ChartCard, ChartSectionHeading, TrendChart } from '../components/Charts';
import { NameCountTable, type NameCountRow } from '../components/NameCountTable';
import { StatCards } from '../components/StatCards';
import type { StatCard } from '../components/StatCards';
import type { CallSummary, DateRow } from '../utils/analyticsSummary';
import classes from './AnalyticsScreen.module.css';

type IvrExpanded = 'callsByDate' | 'stepDepth' | 'content' | 'teacher';

export function IvrPanel({ stats, loading, error }: { stats: CallSummary; loading: boolean; error: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<IvrExpanded | 'closed'>('closed');

  const cards: StatCard[] = [
    { label: t('analytics.kpi.totalCalls'), value: String(stats.totalCalls) },
    { label: t('analytics.kpi.uniqueUsers'), value: String(stats.uniqueUsers) },
    { label: t('analytics.kpi.avgDuration'), value: stats.avgDuration },
    { label: t('analytics.kpi.median'), value: stats.medianDuration },
    { label: t('analytics.kpi.totalDuration'), value: stats.totalDuration },
    { label: t('analytics.kpi.dropFail'), value: stats.dropFailPercent },
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

  const expandedTitles: Record<IvrExpanded, string> = {
    callsByDate: t('analytics.charts.callsByDate'),
    stepDepth: t('analytics.charts.stepDepth'),
    content: t('analytics.charts.contentUsage'),
    teacher: t('analytics.charts.callsByTeacher'),
  };

  const expandedRows: Record<IvrExpanded, NameCountRow[]> = {
    callsByDate: stats.callsByDate,
    stepDepth: stats.stepDepth,
    content: stats.contentUsage,
    teacher: stats.callsByTeacher,
  };

  const expandedCharts = {
    callsByDate: <TrendChart bins={stats.callsByDate} />,
    stepDepth: <BarList bins={stats.stepDepth} compact={false} />,
    content: <BarList bins={stats.contentUsage} compact={false} />,
    teacher: <BarList bins={stats.callsByTeacher} compact={false} />,
  };

  return (
    <Stack gap="md">
      {error && <Alert>{error}</Alert>}
      <StatCards cards={cards} loading={loading} />
      <ChartSectionHeading label={t('analytics.chartsLabel')} />
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
          loading={loading}
          page={page}
          pageSize={10}
          onPageChange={setPage}
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
