import { Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';
import { PageTitle } from '@shared/components/PageTitle';

const cards = ['upload', 'source', 'quiz'] as const;

const chips = [
  { key: 'quiz', target: '/create/quiz' },
  { key: 'audio', target: '/create/upload' },
] as const;

export function CreateHubScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <PageTitle title={t('create.title')} />
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
              h={44}
              radius="xl"
              onClick={() => void navigate({ to: chip.target })}
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
