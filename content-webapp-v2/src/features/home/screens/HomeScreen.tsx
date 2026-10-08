import { Alert, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Plus } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { useLibrary } from '@features/library/hooks/useLibrary';
import { useJobs } from '@features/jobs/hooks/useJobs';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { TextLink } from '../components/RowCard';
import { AttentionSection } from '../components/AttentionSection';
import { RecentContentSection } from '../components/RecentContentSection';

const tiles = [
  { key: 'create', to: routePaths.create },
  { key: 'makeAccessible', to: routePaths.makeAccessible },
  { key: 'localize', to: routePaths.localize },
  { key: 'review', to: routePaths.review },
  { key: 'library', to: routePaths.library },
  { key: 'jobs', to: routePaths.jobs },
] as const;

export function HomeScreen() {
  const { t } = useTranslation();
  const { rows, error: jobsError } = useJobs();
  const { content, syncAll, syncingAll, error: libraryError } = useLibrary();
  const loadError = toApiErrorMessage(jobsError ?? libraryError);

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap="xs">
          <Title order={2}>{t('home.title')}</Title>
          <Text>{t('home.subtitle')}</Text>
        </Stack>
        <Group gap="md">
          <Button
            variant="outline"
            loading={syncingAll}
            onClick={() => void syncAll()}
          >
            {t('library.syncAll')}
          </Button>
          <Button
            leftSection={<Plus size={16} aria-hidden />}
            component={Link}
            to={routePaths.create}
          >
            {t('library.addContent')}
          </Button>
        </Group>
      </Group>
      {loadError && <Alert>{loadError}</Alert>}
      <Stack gap="md">
        <Text variant="eyebrow">{t('home.whatYouCanDo')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {tiles.map(({ key, to }) => (
            <Paper key={key} p="lg" radius="md" h="100%">
              <Stack gap="xs">
                <Title order={4}>{t(`home.tiles.${key}.title`)}</Title>
                <Text size="xs">{t(`home.tiles.${key}.description`)}</Text>
                <TextLink to={to} label={t(`home.tiles.${key}.cta`)} />
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
      <AttentionSection rows={rows} />
      <RecentContentSection content={content} />
    </Stack>
  );
}
