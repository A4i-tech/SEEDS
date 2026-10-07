import { Button, Card, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { routePaths } from '@app/navigation/routePaths';

const cards = [
  { key: 'ai', target: `${routePaths.create}/ai` },
  { key: 'upload', target: `${routePaths.create}/upload` },
  { key: 'source', target: `${routePaths.create}/source` },
  { key: 'quiz', target: `${routePaths.create}/quiz` },
] as const;

export function CreateHubScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Stack gap="md">
      <Title order={2}>{t('create.title')}</Title>
      <Text c="dimmed">{t('create.description')}</Text>
      <Text fw={700}>{t('create.howToStart')}</Text>
      <SimpleGrid cols={2} spacing="md">
        {cards.map((card, index) => (
          <Card key={card.key} withBorder padding="lg" radius="md">
            <Stack gap="xs">
              <Text fw={700}>
                {index + 1} · {t(`create.cards.${card.key}.title`)}
              </Text>
              <Text size="sm" c="dimmed">
                {t(`create.cards.${card.key}.body`)}
              </Text>
              <Button
                variant="outline"
                onClick={() => void navigate(card.target)}
              >
                {t(`create.cards.${card.key}.action`)}
              </Button>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export { CreateAiScreen } from './CreateAiScreen';
export { CreateUploadScreen } from './CreateUploadScreen';
export { CreateSourceScreen } from './CreateSourceScreen';
