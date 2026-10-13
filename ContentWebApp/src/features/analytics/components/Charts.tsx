import { BarChart, BarsList } from '@mantine/charts';
import { Group, Paper, Stack, Text } from '@mantine/core';
import { SquareArrowOutUpRight } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CountBin } from '../utils/analyticsSummary';
import classes from './Charts.module.css';

const SERIES_FILLS = [
  'var(--seeds-chart-1)',
  'var(--seeds-chart-2)',
  'var(--seeds-chart-3)',
  'var(--seeds-chart-4)',
];

const formatDay = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function ChartCard({
  title,
  expandLabel,
  onExpand,
  children,
}: {
  title: string;
  expandLabel: string;
  onExpand: () => void;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onExpand();
    }
  };

  return (
    <Paper
      p="md"
      role="button"
      tabIndex={0}
      aria-label={`${title} — ${expandLabel}`}
      className={classes.card}
      onClick={onExpand}
      onKeyDown={onKeyDown}
    >
      <Stack gap="sm">
        <Group justify="space-between" gap="xs">
          <Text fw={700}>{title}</Text>
          <Group gap={4} wrap="nowrap" className={classes.expand}>
            <Text size="sm">{expandLabel}</Text>
            <SquareArrowOutUpRight size={14} aria-hidden />
          </Group>
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}

export function ChartSectionHeading({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" align="center">
      <Text variant="eyebrow" size="sm">
        {label}
      </Text>
      <Text size="sm" c="dimmed">
        {t('analytics.chartsHint')}
      </Text>
    </Group>
  );
}

export function TrendChart({ bins, hideAxis = false }: { bins: CountBin[]; hideAxis?: boolean }) {
  return (
    <BarChart
      h={120}
      data={bins}
      dataKey="label"
      series={[{ name: 'count', color: 'var(--seeds-brandmark-bg)' }]}
      withXAxis={!hideAxis}
      withYAxis={false}
      gridAxis="none"
      tickLine="none"
      xAxisProps={{ tickFormatter: formatDay, interval: 'preserveStartEnd' }}
    />
  );
}

export function BarList({ bins, compact }: { bins: CountBin[]; compact: boolean }) {
  const visible = compact ? bins.slice(0, 4) : bins;
  return (
    <BarsList
      data={visible.map((bin, i) => ({ name: bin.label, value: bin.count, color: SERIES_FILLS[i % SERIES_FILLS.length] }))}
      barHeight={24}
      minBarSize={120}
    />
  );
}

export function StackedBar({ bins }: { bins: CountBin[] }) {
  return (
    <BarChart
      h={96}
      type="percent"
      orientation="vertical"
      data={[Object.fromEntries([['name', ''], ...bins.map((bin, i) => [`s${i}`, bin.count])])]}
      dataKey="name"
      series={bins.map((bin, i) => ({ name: `s${i}`, label: bin.label, color: SERIES_FILLS[i % SERIES_FILLS.length] }))}
      withXAxis={false}
      withYAxis={false}
      gridAxis="none"
      tickLine="none"
      withLegend
    />
  );
}