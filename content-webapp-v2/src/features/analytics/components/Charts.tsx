import { Text } from '@mantine/core';
import { SquareArrowOutUpRight } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { CountBin } from '../hooks/useAnalytics';
import classes from './Charts.module.css';

const SERIES_FILLS = [
  'var(--seeds-chart-1)',
  'var(--seeds-chart-2)',
  'var(--seeds-chart-3)',
  'var(--seeds-chart-4)',
];

const formatDay = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function barHeight(count: number, max: number): number {
  if (max === 0) return 0;
  return Math.max(4, Math.round((count / max) * 96));
}

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
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title} — ${expandLabel}`}
      className={classes.card}
      onClick={onExpand}
      onKeyDown={onKeyDown}
    >
      <div className={classes.head}>
        <Text fw={700}>{title}</Text>
        <Text size="sm" className={classes.expand}>
          {expandLabel}
          <SquareArrowOutUpRight size={14} aria-hidden />
        </Text>
      </div>
      {children}
    </div>
  );
}

export function TrendChart({ bins, hideAxis = false }: { bins: CountBin[]; hideAxis?: boolean }) {
  if (bins.length === 0) return <></>;
  const max = Math.max(...bins.map((b) => b.count));
  const width = bins.length * 26;
  return (
    <div className={classes.trend}>
      <svg viewBox={`0 0 ${width} 100`} className={classes.trendSvg} role="img" aria-hidden>
        {bins.map((bin, i) => {
          const h = barHeight(bin.count, max);
          return (
            <rect
              key={bin.label}
              x={i * 26 + 4}
              y={100 - h}
              width={18}
              height={h}
              rx={3}
              fill="var(--seeds-brandmark-bg)"
            />
          );
        })}
      </svg>
      {!hideAxis && (
        <div className={classes.axis}>
          <Text size="sm" c="dimmed">
            {formatDay(bins[0].label)}
          </Text>
          {bins.length > 1 && (
            <Text size="sm" c="dimmed">
              {formatDay(bins[bins.length - 1].label)}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

function visibleBins(bins: CountBin[], compact: boolean): CountBin[] {
  if (!compact) return bins;
  return bins.slice(0, 4);
}

export function BarList({ bins, compact }: { bins: CountBin[]; compact: boolean }) {
  if (bins.length === 0) return <></>;
  const max = Math.max(...bins.map((b) => b.count));
  const visible = visibleBins(bins, compact);
  return (
    <div className={classes.bars}>
      {visible.map((bin, i) => (
        <div key={bin.label} className={classes.barRow}>
          <Text size="sm" c="dimmed" className={classes.barLabel}>
            {bin.label}
          </Text>
          <svg viewBox="0 0 100 12" preserveAspectRatio="none" className={classes.track} aria-hidden>
            {max > 0 && (
              <rect
                x={0}
                y={0}
                width={Math.max(2, (bin.count / max) * 100)}
                height={12}
                rx={3}
                fill={SERIES_FILLS[i % SERIES_FILLS.length]}
              />
            )}
          </svg>
          {!compact && (
            <Text size="sm" className={classes.barCount}>
              {bin.count}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

export function StackedBar({ bins }: { bins: CountBin[] }) {
  const total = bins.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return <></>;
  const starts = bins.map((_, i) => (bins.slice(0, i).reduce((sum, b) => sum + b.count, 0) / total) * 100);
  return (
    <div className={classes.stacked}>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" className={classes.stackedTrack} aria-hidden>
        {bins.map((bin, i) => {
          return (
            <rect
              key={bin.label}
              x={starts[i]}
              y={0}
              width={(bin.count / total) * 100}
              height={12}
              fill={SERIES_FILLS[i % SERIES_FILLS.length]}
            />
          );
        })}
      </svg>
      <div className={classes.legend}>
        {bins.map((bin, i) => (
          <Text key={bin.label} size="sm" className={classes.legendItem}>
            <span className={classes.dot} style={{ backgroundColor: SERIES_FILLS[i % SERIES_FILLS.length] }} />
            {bin.label} · {Math.round((bin.count / total) * 100)}%
          </Text>
        ))}
      </div>
    </div>
  );
}
