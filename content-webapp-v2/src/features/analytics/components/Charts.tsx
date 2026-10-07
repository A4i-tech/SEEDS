import { Text } from '@mantine/core';
import type { KeyboardEvent, ReactNode } from 'react';
import type { CountBin } from '../hooks/useAnalytics';
import classes from './Charts.module.css';

const SERIES_FILLS = [
  'var(--seeds-brandmark-bg)',
  'var(--seeds-eyebrow-text)',
  'var(--seeds-badge-warning-text)',
  'var(--seeds-btn-destructive-bg)',
];

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
        </Text>
      </div>
      {children}
    </div>
  );
}

export function TrendChart({ bins }: { bins: CountBin[] }) {
  if (bins.length === 0) return null;
  const max = Math.max(...bins.map((b) => b.count));
  const width = bins.length * 26;
  return (
    <div className={classes.trend}>
      <svg viewBox={`0 0 ${width} 100`} className={classes.trendSvg} role="img" aria-hidden>
        {bins.map((bin, i) => {
          const h = max === 0 ? 0 : Math.max(4, Math.round((bin.count / max) * 96));
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
      <div className={classes.axis}>
        <Text size="sm" c="dimmed">
          {bins[0]?.label}
        </Text>
        {bins.length > 1 && (
          <Text size="sm" c="dimmed">
            {bins[bins.length - 1]?.label}
          </Text>
        )}
      </div>
    </div>
  );
}

export function BarList({ bins, compact }: { bins: CountBin[]; compact: boolean }) {
  if (bins.length === 0) return null;
  const max = Math.max(...bins.map((b) => b.count));
  const visible = compact ? bins.slice(0, 4) : bins;
  return (
    <div className={classes.bars}>
      {visible.map((bin, i) => (
        <div key={bin.label} className={classes.barRow}>
          <Text size="sm" c="dimmed" className={classes.barLabel}>
            {bin.label}
          </Text>
          <svg viewBox="0 0 100 12" preserveAspectRatio="none" className={classes.track} aria-hidden>
            <rect x={0} y={0} width={100} height={12} rx={3} fill="var(--seeds-badge-neutral-bg)" />
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
          <Text size="sm" className={classes.barCount}>
            {bin.count}
          </Text>
        </div>
      ))}
    </div>
  );
}
