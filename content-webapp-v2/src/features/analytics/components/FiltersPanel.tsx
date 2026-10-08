import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectValue } from '@shared/utils/select';
import { lastNDays, monthToDate } from '../hooks/useAnalytics';
import classes from './FiltersPanel.module.css';

export type QuickRange = 'last7' | 'last30' | 'month' | 'custom';

export interface FiltersValue {
  branch: string;
  quick: QuickRange;
  start: string;
  end: string;
}

const QUICKS: QuickRange[] = ['last7', 'last30', 'month', 'custom'];

function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const TODAY = toInputDate(new Date());

const QUICK_DAYS = { last7: 7, last30: 30 } as const;

function datesForQuick(quick: QuickRange): { start: string; end: string } {
  if (quick === 'month') {
    const range = monthToDate();
    return { start: toInputDate(range.start), end: toInputDate(range.end) };
  }
  if (quick === 'custom') {
    const today = toInputDate(new Date());
    return { start: today, end: today };
  }
  const range = lastNDays(QUICK_DAYS[quick]);
  return { start: toInputDate(range.start), end: toInputDate(range.end) };
}

function quickVariant(isActive: boolean) {
  if (isActive) return 'filled';
  return 'outline';
}

function quickClass(isActive: boolean): string {
  if (isActive) return classes.activeQuick;
  return classes.quick;
}

export function FiltersPanel({
  schools,
  showBranch,
  initial,
  loading,
  onApply,
}: {
  schools: Array<{ value: string; label: string }>;
  showBranch: boolean;
  initial: FiltersValue;
  loading: boolean;
  onApply: (value: FiltersValue) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FiltersValue>(initial);

  const pickQuick = (quick: QuickRange) => {
    if (quick === 'custom') {
      setDraft((d) => ({ ...d, quick }));
      return;
    }
    const dates = datesForQuick(quick);
    setDraft((d) => ({ ...d, quick, ...dates }));
  };

  const canApply = draft.start.length > 0 && draft.end.length > 0 && !loading;

  const applyLabel = (): string => {
    if (loading) return t('analytics.states.loading');
    return t('analytics.filtersPanel.apply');
  };

  return (
    <Stack gap="md">
      <div>
        <Text fw={700}>{t('analytics.filtersPanel.title')}</Text>
        <Text size="sm" c="dimmed">
          {t('analytics.filtersPanel.subtitle')}
        </Text>
      </div>
      {showBranch && (
        <Select
          label={t('analytics.filtersPanel.branch')}
          value={draft.branch}
          onChange={(v) => setDraft((d) => ({ ...d, branch: selectValue(v, 'all') }))}
          data={[{ value: 'all', label: t('analytics.filtersPanel.branchAll') }, ...schools]}
        />
      )}
      <div>
        <Text size="sm" fw={700} className={classes.sectionLabel}>
          {t('analytics.filtersPanel.quickRange')}
        </Text>
        <Group gap="xs">
          {QUICKS.map((quick) => (
            <Button
              key={quick}
              variant={quickVariant(draft.quick === quick)}
              size="sm"
              className={quickClass(draft.quick === quick)}
              onClick={() => pickQuick(quick)}
            >
              {t(`analytics.filtersPanel.${quick}`)}
            </Button>
          ))}
        </Group>
      </div>
      <Group gap="md" grow>
        <TextInput miw={200}
          label={t('analytics.filtersPanel.start')}
          type="date"
          value={draft.start}
          max={draft.end || undefined}
          onChange={(e) => setDraft((d) => ({ ...d, quick: 'custom', start: e.currentTarget.value }))}
        />
        <TextInput miw={200}
          label={t('analytics.filtersPanel.end')}
          type="date"
          value={draft.end}
          min={draft.start || undefined}
          max={TODAY}
          onChange={(e) => setDraft((d) => ({ ...d, quick: 'custom', end: e.currentTarget.value }))}
        />
      </Group>
      <Button
        className={classes.apply}
        disabled={!canApply}
        onClick={() => onApply(draft)}
        aria-label={t('analytics.filtersPanel.apply')}
      >
        {applyLabel()}
      </Button>
    </Stack>
  );
}
