import { Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';

const cards = ['ai', 'upload', 'source', 'quiz'] as const;

type ChipTarget = '/create/ai' | '/create/quiz' | '/create/upload';

const chips: { key: string; target: ChipTarget; search?: { experience: string } }[] = [
  { key: 'poem', target: `/create/ai`, search: { experience: 'poem' } },
  { key: 'story', target: `/create/ai`, search: { experience: 'story' } },
  { key: 'quiz', target: `/create/quiz` },
  { key: 'song', target: `/create/ai`, search: { experience: 'song' } },
  { key: 'audio', target: `/create/upload` },
  { key: 'activity', target: `/create/ai`, search: { experience: 'snippet' } },
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
        <Text variant="eyebrow">{t('create.howToStart')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {cards.map((card, index) => (
            <Paper key={card} p="lg" radius="md" h="100%">
              <Stack gap="xs" justify="space-between" h="100%">
                <Stack gap="xs">
                  <Title order={4}>
                    {index + 1} · {t(`create.cards.${card}.title`)}
                  </Title>
                  {z.array(z.string()).parse(t(`create.cards.${card}.body`, { returnObjects: true })).map((line) => (
                    <Text key={line} size="sm">
                      {line}
                    </Text>
                  ))}
                </Stack>
                <Group>
                  <Button onClick={() => void navigate({ to: `/create/${card}` })}>
                    {t(`create.cards.${card}.action`)}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
      <Stack gap="md">
        <Text variant="eyebrow">{t('create.jumpByExperience')}</Text>
        <Group gap="sm">
          {chips.map((chip) => (
            <Button
              key={chip.key}
              variant="outline"
              size="compact-md"
              radius="xl"
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
