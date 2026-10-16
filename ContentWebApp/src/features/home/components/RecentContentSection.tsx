import { Anchor, SimpleGrid, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ContentItem } from '@features/library/types/content.types';
import { RowCard } from './RowCard';

export function RecentContentSection({ content }: { content: ContentItem[] }) {
  const { t } = useTranslation();
  const recent = [...content].sort((a, b) => b.creation_time - a.creation_time).slice(0, 2);

  return (
    <Stack gap="md">
      <Text variant="eyebrow">{t('home.recent')}</Text>
      {recent.length === 0 && <Text>{t('home.recentEmpty')}</Text>}
      {recent.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {recent.map((item) => (
            <RowCard
              key={item.id}
              title={`${item.title.english} · ${item.type}`}
              link={
                <Anchor
                  renderRoot={(props) => (
                    <Link to="/library/$kind/$id" params={{ kind: item.type, id: item.id }} {...props} />
                  )}
                  fw={700}
                  fz="sm"
                >
                  {t('home.open')}
                </Anchor>
              }
            />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
