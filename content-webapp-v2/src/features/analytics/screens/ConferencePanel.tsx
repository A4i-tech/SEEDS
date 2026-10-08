import { Alert, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { BarList, ChartCard, ChartSectionHeading, TrendChart } from '../components/Charts';
import { StatCards } from '../components/StatCards';
import type { StatCard } from '../components/StatCards';
import type { CallSummary, ConferenceSummary, RecentConference } from '../utils/analyticsSummary';
import classes from './AnalyticsScreen.module.css';

type ConferenceExpanded = 'byDate' | 'byTeacher' | 'classSize' | 'durationTrend';

export function ConferencePanel({
  stats,
  conference,
  loading,
  error,
}: {
  stats: CallSummary;
  conference: ConferenceSummary;
  loading: boolean;
  error: string;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ConferenceExpanded | 'closed'>('closed');

  const cards: StatCard[] = [
    { label: t('analytics.conference.totalConferences'), value: String(stats.totalCalls) },
    { label: t('analytics.kpi.avgDuration'), value: stats.avgDuration },
    { label: t('analytics.conference.avgClassSize'), value: '—' },
    { label: t('analytics.conference.uniqueTeachers'), value: String(stats.uniqueUsers) },
  ];

  const columns: DataTableColumn<RecentConference>[] = [
    { key: 'date', header: t('analytics.conference.columns.date'), render: (row) => row.date },
    { key: 'teacher', header: t('analytics.conference.columns.teacher'), render: (row) => row.teacher },
    { key: 'students', header: t('analytics.conference.columns.students'), render: () => '—' },
    { key: 'duration', header: t('analytics.conference.columns.duration'), render: (row) => row.duration },
    { key: 'branch', header: t('analytics.conference.columns.branch'), render: () => '—' },
  ];

  const unavailable = <Text c="dimmed">{t('analytics.conference.unavailable')}</Text>;

  const expandedCharts = {
    byDate: <TrendChart bins={stats.callsByDate} />,
    byTeacher: <BarList bins={stats.callsByTeacher} compact={false} />,
    classSize: unavailable,
    durationTrend: <TrendChart bins={conference.durationTrend} />,
  };

  return (
    <Stack gap="md">
      {error && <Alert>{error}</Alert>}
      <StatCards cards={cards} loading={loading} />
      <ChartSectionHeading label={t('analytics.chartsLabel')} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <ChartCard
          title={t('analytics.conference.byDate')}
          expandLabel={t('analytics.expand')}
          onExpand={() => setExpanded('byDate')}
        >
          <TrendChart bins={stats.callsByDate} />
        </ChartCard>
        <ChartCard
          title={t('analytics.conference.byTeacher')}
          expandLabel={t('analytics.expand')}
          onExpand={() => setExpanded('byTeacher')}
        >
          <BarList bins={stats.callsByTeacher} compact />
        </ChartCard>
        <ChartCard
          title={t('analytics.conference.classSize')}
          expandLabel={t('analytics.expand')}
          onExpand={() => setExpanded('classSize')}
        >
          {unavailable}
        </ChartCard>
        <ChartCard
          title={t('analytics.conference.durationTrend')}
          expandLabel={t('analytics.expand')}
          onExpand={() => setExpanded('durationTrend')}
        >
          <TrendChart bins={conference.durationTrend} hideAxis />
        </ChartCard>
      </SimpleGrid>
      <Title order={4}>{t('analytics.conference.recent')}</Title>
      <div className={classes.preview}>
        <DataTable<RecentConference>
          columns={columns}
          rows={conference.recent}
          getRowId={(row) => row.id}
          loading={loading}
          page={page}
          pageSize={10}
          onPageChange={setPage}
          emptyMessage={t('analytics.noData')}
        />
      </div>
      {expanded !== 'closed' && (
        <Modal
          opened
          onClose={() => setExpanded('closed')}
          title={t(`analytics.conference.${expanded}`)}
          size="lg"
          centered
        >
          {expandedCharts[expanded]}
        </Modal>
      )}
    </Stack>
  );
}
