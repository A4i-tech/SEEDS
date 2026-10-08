import { Anchor, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { flowRoute, type JobRow } from '@features/jobs/types/job.types';
import { StatusBadge } from '@shared/components/StatusBadge';
import { RowCard, TextLink } from './RowCard';

function AttentionLink({ row }: { row: JobRow }) {
  const { t } = useTranslation();
  if (row.status === 'failed' && row.type === 'make-accessible') {
    return (
      <Anchor
        renderRoot={(props) => <Link to="/make-accessible/$jobId" params={{ jobId: row.id }} {...props} />}
        fw={700}
        fz="sm"
      >
        {t('home.openEdit')}
      </Anchor>
    );
  }
  if (row.status === 'failed') return <TextLink to={flowRoute[row.type]} label={t('home.openEdit')} />;
  return <TextLink to={'/review'} label={t('home.tiles.review.cta')} />;
}

export function AttentionSection({ rows }: { rows: JobRow[] }) {
  const { t } = useTranslation();
  const attention = rows.filter((row) => row.status === 'failed' || row.status === 'needs-review');

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text variant="eyebrow">{t('home.needsAttention')}</Text>
        {attention.length > 0 && (
          <TextLink to={'/jobs'} label={t('home.seeAll', { count: attention.length })} />
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
  );
}
