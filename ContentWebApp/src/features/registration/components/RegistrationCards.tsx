import { Button, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LoadError } from '@shared/components/LoadError';
import type { AnalyticsRole } from '@features/analytics/types/analytics.types';
import { useAnalyticsDashboard, useAnalyticsRole } from '@features/analytics/hooks/useAnalytics';

export type Section = 'schools' | 'teachers' | 'students';

interface Props {
  sections: readonly Section[];
  active: Section;
  onSelect: (section: Section) => void;
}

export function RegistrationCards(props: Props) {
  const role = useAnalyticsRole();
  return role && <RoleCards role={role} {...props} />;
}

function RoleCards({ role, sections, active, onSelect }: Props & { role: AnalyticsRole }) {
  const { t } = useTranslation();
  const { tenant, school } = useAnalyticsDashboard(role);
  const state = role === 'tenant' ? tenant : school;
  if (state.status === 'error') return <LoadError error={state.error} />;
  const counts: Partial<Record<Section, number>> = {};
  if (tenant.status === 'done') counts.schools = tenant.data.statistics.total_schools;
  if (school.status === 'done') {
    counts.teachers = school.data.teachers;
    counts.students = school.data.students;
  }
  return (
    <Stack gap="md">
      <Text variant="eyebrow">{t('registration.whoToRegister')}</Text>
      <SimpleGrid cols={{ base: 1, sm: sections.length }} spacing="md">
        {sections.map((section) => (
          <Paper key={section} p="lg" radius="md" h="100%">
            <Stack gap="xs" justify="space-between" h="100%">
              <Stack gap="xs">
                <Title order={4}>{t(`registration.cards.${section}.title`)}</Title>
                <Text>{t(`registration.cards.${section}.description`)}</Text>
                {counts[section] !== undefined && (
                  <Text variant="rowTitle">{t(`registration.cards.${section}.count`, { count: counts[section] })}</Text>
                )}
              </Stack>
              <div>
                <Button variant={active === section ? 'filled' : 'outline'} onClick={() => onSelect(section)}>
                  {t(`registration.cards.${section}.action`)}
                </Button>
              </div>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
