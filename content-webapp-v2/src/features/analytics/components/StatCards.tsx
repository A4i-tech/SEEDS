import { Skeleton, Text } from '@mantine/core';
import classes from './StatCards.module.css';

export interface StatCard {
  label: string;
  value: string;
}

export function StatCards({ cards, loading }: { cards: StatCard[]; loading: boolean }) {
  if (loading) {
    return (
      <div className={classes.row} aria-label="Loading">
        {cards.map((card) => (
          <div key={card.label} className={classes.card}>
            <Skeleton height={14} />
            <Skeleton height={28} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={classes.row}>
      {cards.map((card) => (
        <div key={card.label} className={classes.card}>
          <Text className={classes.label}>{card.label}</Text>
          <Text className={classes.value}>{card.value}</Text>
        </div>
      ))}
    </div>
  );
}
