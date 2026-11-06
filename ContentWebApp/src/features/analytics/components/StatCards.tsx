import { Paper, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export interface StatCard {
  label: string;
  value: string;
}

const gridCols = (count: number) => ({ base: 2, sm: count % 3 === 0 ? 3 : 2, lg: count });

export function StatCards({ cards, loading }: { cards: StatCard[]; loading: boolean }) {
  const { t } = useTranslation();
  if (loading && cards.length === 0) {
    return (
      <SimpleGrid cols={gridCols(4)} aria-label={t('a11y.loading')}>
        {[0, 1, 2, 3].map((index) => (
          <Paper key={index} p="md">
            <Stack gap={4}>
              <Skeleton height={14} />
              <Skeleton height={28} />
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    );
  }
  if (loading) {
    return (
      <SimpleGrid cols={gridCols(cards.length)} aria-label={t('a11y.loading')}>
        {cards.map((card) => (
          <Paper key={card.label} p="md">
            <Stack gap={4}>
              <Skeleton height={14} />
              <Skeleton height={28} />
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    );
  }
  return (
    <SimpleGrid cols={gridCols(cards.length)}>
      {cards.map((card) => (
        <Paper key={card.label} p="md">
          <Stack gap={4}>
            <Text variant="eyebrow" size="sm">
              {card.label}
            </Text>
            <Text fz={24} variant="rowTitle" lh={1.3}>
              {card.value}
            </Text>
          </Stack>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
