import { SimpleGrid, Skeleton, Text } from '@mantine/core';
import classes from './StatCards.module.css';

export interface StatCard {
  label: string;
  value: string;
}

const gridCols = (count: number) => ({ base: 2, sm: count % 3 === 0 ? 3 : 2, lg: count });

export function StatCards({ cards, loading }: { cards: StatCard[]; loading: boolean }) {
  if (loading) {
    return (
      <SimpleGrid cols={gridCols(cards.length)} aria-label="Loading">
        {cards.map((card) => (
          <div key={card.label} className={classes.card}>
            <Skeleton height={14} />
            <Skeleton height={28} />
          </div>
        ))}
      </SimpleGrid>
    );
  }
  return (
    <SimpleGrid cols={gridCols(cards.length)}>
      {cards.map((card) => (
        <div key={card.label} className={classes.card}>
          <Text className={classes.label}>{card.label}</Text>
          <Text className={classes.value}>{card.value}</Text>
        </div>
      ))}
    </SimpleGrid>
  );
}
