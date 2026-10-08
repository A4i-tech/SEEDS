import { Button, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import classes from './CreateHubScreen.module.css';

const cards = [
  { key: 'ai', target: `${routePaths.create}/ai` },
  { key: 'upload', target: `${routePaths.create}/upload` },
  { key: 'source', target: `${routePaths.create}/source` },
  { key: 'quiz', target: `${routePaths.create}/quiz` },
] as const;

const chips: { key: string; target: string; search?: { experience: string } }[] = [
  { key: 'poem', target: `${routePaths.create}/ai`, search: { experience: 'poem' } },
  { key: 'story', target: `${routePaths.create}/ai`, search: { experience: 'story' } },
  { key: 'quiz', target: `${routePaths.create}/quiz` },
  { key: 'song', target: `${routePaths.create}/ai`, search: { experience: 'song' } },
  { key: 'audio', target: `${routePaths.create}/upload` },
  { key: 'activity', target: `${routePaths.create}/ai`, search: { experience: 'snippet' } },
];

export function CreateHubScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Title order={2}>{t('create.title')}</Title>
        <Text>{t('create.description')}</Text>
      </Stack>
      <Stack gap="md">
        <Text className={classes.eyebrow}>{t('create.howToStart')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {cards.map((card, index) => (
            <Stack key={card.key} gap="xs" justify="space-between" className={classes.card}>
              <Stack gap="xs">
                <Title order={4}>
                  {index + 1} · {t(`create.cards.${card.key}.title`)}
                </Title>
                {z.array(z.string()).parse(t(`create.cards.${card.key}.body`, { returnObjects: true })).map((line) => (
                  <Text key={line} size="sm">
                    {line}
                  </Text>
                ))}
              </Stack>
              <Group>
                <Button className={classes.primaryButton} onClick={() => void navigate({ to: card.target })}>
                  {t(`create.cards.${card.key}.action`)}
                </Button>
              </Group>
            </Stack>
          ))}
        </SimpleGrid>
      </Stack>
      <Stack gap="md">
        <Text className={classes.eyebrow}>{t('create.jumpByExperience')}</Text>
        <Group gap="sm">
          {chips.map((chip) => (
            <Button
              key={chip.key}
              variant="outline"
              size="compact-md"
              className={classes.chip}
              onClick={() => void navigate({ to: chip.target, search: chip.search })}
            >
              {t(`create.chips.${chip.key}`)}
            </Button>
          ))}
        </Group>
        <Text size="sm">{t('create.chipsNote')}</Text>
      </Stack>
    </Stack>
  );
}
