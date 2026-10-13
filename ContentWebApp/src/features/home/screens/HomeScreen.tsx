import { Alert, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Plus } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '@features/library/hooks/useLibrary';
import { useJobs } from '@features/jobs/hooks/useJobs';
import { TextLink } from '../components/RowCard';
import { AttentionSection } from '../components/AttentionSection';
import { RecentContentSection } from '../components/RecentContentSection';

const tiles = [
  { key: 'create', to: '/create' },
  { key: 'makeAccessible', to: '/make-accessible' },
  { key: 'localize', to: '/localize' },
  { key: 'review', to: '/review' },
  { key: 'library', to: '/library' },
  { key: 'jobs', to: '/jobs' },
] as const;

export function HomeScreen() {
  const { t } = useTranslation();
  const jobsState = useJobs();
  const { state: libraryState, content, syncAll, syncingAll } = useLibrary();
  const rows = jobsState.status === 'done' ? jobsState.data : [];

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
            to={'/create'}
          >
            {t('library.addContent')}
          </Button>
        </Group>
      </Group>
      {jobsState.status === 'error' && <Alert>{jobsState.error.message}</Alert>}
      {libraryState.status === 'error' && <Alert>{libraryState.error.message}</Alert>}
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
