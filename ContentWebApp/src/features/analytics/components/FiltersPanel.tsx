import { Button, Group, Input, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectValue } from '@shared/utils/select';
import { lastNDays, monthToDate, toInputDate } from '../hooks/useAnalytics';

type QuickRange = 'last7' | 'last30' | 'month' | 'custom';

export interface FiltersValue {
  branch: string;
  quick: QuickRange;
  start: string;
  end: string;
}

const QUICKS: QuickRange[] = ['last7', 'last30', 'month', 'custom'];

const TODAY = toInputDate(new Date());

const QUICK_RANGES: Record<Exclude<QuickRange, 'custom'>, () => { start: Date; end: Date }> = {
  last7: () => lastNDays(7),
  last30: () => lastNDays(30),
  month: monthToDate,
};

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
    const { start, end } = QUICK_RANGES[quick]();
    setDraft((d) => ({ ...d, quick, start: toInputDate(start), end: toInputDate(end) }));
  };

  const canApply = draft.start.length > 0 && draft.end.length > 0;

  return (
    <Stack gap="md">
      <Stack gap={0}>
        <Text fw={700}>{t('analytics.filtersPanel.title')}</Text>
        <Text size="sm" c="dimmed">
          {t('analytics.filtersPanel.subtitle')}
        </Text>
      </Stack>
      {showBranch && (
        <Select
          label={t('analytics.filtersPanel.branch')}
          value={draft.branch}
          onChange={(v) => setDraft((d) => ({ ...d, branch: selectValue(v, 'all') }))}
          data={[{ value: 'all', label: t('analytics.filtersPanel.branchAll') }, ...schools]}
        />
      )}
      <Input.Wrapper label={t('analytics.filtersPanel.quickRange')}>
        <SegmentedControl
          fullWidth
          value={draft.quick}
          onChange={(v) => pickQuick(v as QuickRange)}
          data={QUICKS.map((quick) => ({ value: quick, label: t(`analytics.filtersPanel.${quick}`) }))}
        />
      </Input.Wrapper>
      <Group gap="md" grow>
        <TextInput miw={200}
          label={t('analytics.filtersPanel.start')}
          type="date"
          value={draft.start}
          max={draft.end}
          onChange={(e) => setDraft((d) => ({ ...d, quick: 'custom', start: e.currentTarget.value }))}
        />
        <TextInput miw={200}
          label={t('analytics.filtersPanel.end')}
          type="date"
          value={draft.end}
          min={draft.start}
          max={TODAY}
          onChange={(e) => setDraft((d) => ({ ...d, quick: 'custom', end: e.currentTarget.value }))}
        />
      </Group>
      <Button
        loading={loading}
        disabled={!canApply}
        onClick={() => onApply(draft)}
        aria-label={t('analytics.filtersPanel.apply')}
      >
        {t('analytics.filtersPanel.apply')}
      </Button>
    </Stack>
  );
}
