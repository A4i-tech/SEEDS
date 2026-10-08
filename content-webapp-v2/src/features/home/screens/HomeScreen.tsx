import { Button, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { useLibrary } from '@features/library/hooks/useLibrary';
import { useJobs } from '@features/jobs/hooks/useJobs';
import { flowRoute, type JobRow } from '@features/jobs/types/job.types';
import { StatusBadge } from '@shared/components/StatusBadge';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import classes from './HomeScreen.module.css';

const tiles = [
  { key: 'create', to: routePaths.create },
  { key: 'makeAccessible', to: routePaths.makeAccessible },
  { key: 'localize', to: routePaths.localize },
  { key: 'review', to: routePaths.review },
  { key: 'library', to: routePaths.library },
  { key: 'jobs', to: routePaths.jobs },
] as const;

function TextLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={classes.link}>
      {label}
    </Link>
  );
}

function AttentionLink({ row }: { row: JobRow }) {
  const { t } = useTranslation();
  if (row.status === 'failed' && row.type === 'make-accessible') {
    return (
      <Link to="/make-accessible/$jobId" params={{ jobId: row.id }} className={classes.link}>
        {t('home.openEdit')}
      </Link>
    );
  }
  if (row.status === 'failed') return <TextLink to={flowRoute[row.type]} label={t('home.openEdit')} />;
  return <TextLink to={routePaths.review} label={t('home.tiles.review.cta')} />;
}

function RowCard({
  badge,
  title,
  subtitle,
  link,
}: {
  badge?: React.ReactNode;
  title: string;
  subtitle?: string;
  link: React.ReactNode;
}) {
  return (
    <Group className={classes.rowCard} gap="md" wrap="wrap" justify="space-between">
      <Group gap="md" wrap="wrap">
        {badge}
        <Stack gap={0}>
          <Text fw={700}>{title}</Text>
          {subtitle && <Text size="sm">{subtitle}</Text>}
        </Stack>
      </Group>
      {link}
    </Group>
  );
}

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rows, error: jobsError } = useJobs();
  const { content, syncAll, syncingAll, error: libraryError } = useLibrary();
  const loadError = toApiErrorMessage(jobsError ?? libraryError);
  const attention = rows.filter((row) => row.status === 'failed' || row.status === 'needs-review');
  const recent = [...content].sort((a, b) => b.creation_time - a.creation_time).slice(0, 2);

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
            className={classes.secondaryButton}
            loading={syncingAll}
            onClick={() => void syncAll()}
          >
            {t('library.syncAll')}
          </Button>
          <Button
            className={classes.submitButton}
            leftSection={<Plus size={16} aria-hidden />}
            onClick={() => void navigate({ to: routePaths.create })}
          >
            {t('library.addContent')}
          </Button>
        </Group>
      </Group>
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      <Stack gap="md">
        <Text className={classes.eyebrow}>{t('home.whatYouCanDo')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {tiles.map(({ key, to }) => (
            <Stack key={key} gap="xs" className={classes.card}>
              <Title order={4}>{t(`home.tiles.${key}.title`)}</Title>
              <Text size="xs">{t(`home.tiles.${key}.description`)}</Text>
              <TextLink to={to} label={t(`home.tiles.${key}.cta`)} />
            </Stack>
          ))}
        </SimpleGrid>
      </Stack>
      <Stack gap="md">
        <Group justify="space-between">
          <Text className={classes.eyebrow}>{t('home.needsAttention')}</Text>
          {attention.length > 0 && (
            <TextLink to={routePaths.jobs} label={t('home.seeAll', { count: attention.length })} />
          )}
        </Group>
        {attention.length === 0 && <Text>{t('home.attentionEmpty')}</Text>}
        {attention.length > 0 && (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {attention.slice(0, 2).map((row) => (
              <RowCard
                key={`${row.type}:${row.id}`}
                badge={<StatusBadge tone={row.status} label={t(`home.badges.${row.status}`)} />}
                title={`${t(`jobs.types.${row.type}`)} · ${row.title}`}
                subtitle={t(`home.attentionHint.${row.status}`)}
                link={<AttentionLink row={row} />}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
      <Stack gap="md">
        <Text className={classes.eyebrow}>{t('home.recent')}</Text>
        {recent.length === 0 && <Text>{t('home.recentEmpty')}</Text>}
        {recent.length > 0 && (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {recent.map((item) => (
              <RowCard
                key={item.id}
                title={`${item.title.english} · ${item.type}`}
                link={
                  <Link to="/library/$kind/$id" params={{ kind: item.type, id: item.id }} className={classes.link}>
                    {t('home.open')}
                  </Link>
                }
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Stack>
  );
}
