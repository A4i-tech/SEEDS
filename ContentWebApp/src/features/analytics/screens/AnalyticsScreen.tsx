import { Button, Group, Modal, Stack, Tabs, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import i18n from '@shared/i18n';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiltersPanel } from '../components/FiltersPanel';
import type { FiltersValue } from '../components/FiltersPanel';
import type { DateRange } from '../hooks/useAnalytics';
import {
  lastNDays,
  toInputDate,
  useAnalyticsDashboard,
  useAnalyticsRange,
  useAnalyticsRole,
} from '../hooks/useAnalytics';
import type { AnalyticsRole } from '../types/analytics.types';
import { callLogsToCsv, downloadCsv } from '../utils/analyticsCsv';
import { ConferencePanel } from './ConferencePanel';
import { IvrPanel } from './IvrPanel';
import { OrganisationPanel } from './OrganisationPanel';
import { PageTitle } from '@shared/components/PageTitle';

export function formatRangeLabel(start: Date, end: Date): string {
  const day = (d: Date) => d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const year = end.getFullYear();
  return `${day(start)} – ${day(end)} ${year}`;
}

export function AnalyticsScreen() {
  const { t } = useTranslation();
  const role = useAnalyticsRole();

  if (role === '') {
    return (
      <Stack gap="md">
        <PageTitle title={t('analytics.title')} />
        <Text c="dimmed">{t('analytics.noRole')}</Text>
      </Stack>
    );
  }
  return <AnalyticsWorkspace role={role} />;
}

function AnalyticsWorkspace({ role }: { role: AnalyticsRole }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>(() => lastNDays(7));
  const [filtersOpen, { open: openFilters, close: closeFilters }] = useDisclosure(false);
  const [branch, setBranch] = useState('all');

  const analytics = useAnalyticsRange(role, range);
  const dashboards = useAnalyticsDashboard(role);
  const analyticsError = analytics.state.status === 'error' ? analytics.state.error.message : '';
  const analyticsLoading = analytics.state.status === 'loading';

  const schoolOptions =
    dashboards.tenant.status === 'done'
      ? dashboards.tenant.data.schools.map((s) => ({ value: s.id, label: s.name }))
      : [];

  const filtersInitial: FiltersValue = {
    branch,
    quick: 'last7',
    start: toInputDate(range.start),
    end: toInputDate(range.end),
  };

  const exportCsv = () =>
    downloadCsv(
      `analytics_${toInputDate(range.start)}_${toInputDate(range.end)}.csv`,
      callLogsToCsv(analytics.logs),
    );

  const applyFilters = (value: FiltersValue) => {
    setBranch(value.branch);
    setRange({ start: new Date(value.start), end: new Date(value.end) });
    closeFilters();
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <div>
          <PageTitle title={t('analytics.title')} />
          <Text c="dimmed">{t('analytics.description')}</Text>
        </div>
        <Group gap="sm" align="center">
          <Text size="sm" c="dimmed">
            {t('analytics.showing', { range: formatRangeLabel(range.start, range.end) })}
          </Text>
          <Button variant="default" disabled={analyticsLoading || analytics.logs.length === 0} onClick={exportCsv}>
            {t('analytics.exportCsv')}
          </Button>
          <Button onClick={openFilters}>{t('analytics.filters')}</Button>
        </Group>
      </Group>

      <Tabs defaultValue="ivr">
        <Tabs.List>
          <Tabs.Tab value="ivr">{t('analytics.tabs.ivr')}</Tabs.Tab>
          <Tabs.Tab value="conference">{t('analytics.tabs.conference')}</Tabs.Tab>
          <Tabs.Tab value="organisation">{t('analytics.tabs.organisation')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="ivr" pt="md">
          <IvrPanel stats={analytics.stats} loading={analyticsLoading} error={analyticsError} />
        </Tabs.Panel>
        <Tabs.Panel value="conference" pt="md">
          <ConferencePanel
            stats={analytics.stats}
            conference={analytics.conference}
            loading={analyticsLoading}
            error={analyticsError}
          />
        </Tabs.Panel>
        <Tabs.Panel value="organisation" pt="md">
          <OrganisationPanel
            role={role}
            tenant={dashboards.tenant}
            school={dashboards.school}
            branch={branch}
          />
        </Tabs.Panel>
      </Tabs>

      <Modal opened={filtersOpen} onClose={closeFilters} title={t('analytics.filtersPanel.title')} centered>
        <FiltersPanel
          schools={schoolOptions}
          showBranch={role === 'tenant'}
          initial={filtersInitial}
          loading={analyticsLoading}
          onApply={applyFilters}
        />
      </Modal>
    </Stack>
  );
}
