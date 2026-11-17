import { Group, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { RemediationJob } from '@features/jobs/types/job.types';

const MODEL_KEYS = ['ocr', 'verify', 'block_tree', 'alt_text', 'translation'] as const;
const METRIC_KEYS = ['processed_pages', 'diagrams_described', 'tables_fixed', 'flagged_items_count'] as const;

export function RunDetails({ models, metrics }: Pick<RemediationJob, 'models' | 'metrics'>) {
  const { t } = useTranslation();
  const modelRows = MODEL_KEYS.filter((key) => models[key]).map((key) => [t(`review.runDetails.models.${key}`), models[key]]);
  const metricRows = METRIC_KEYS.map((key) => [t(`review.runDetails.metrics.${key}`), metrics[key]]);
  return (
    <Paper p="lg" radius="md">
      <Stack gap="xs">
        <Text variant="label">{t('review.runDetails.title')}</Text>
        <Group gap="xl" align="flex-start">
          {[modelRows, metricRows].map((rows, index) => (
            <Stack key={index === 0 ? 'models' : 'metrics'} gap={2} component="dl" m={0}>
              {rows.map(([label, value]) => (
                <Group key={label} gap="xs">
                  <Text component="dt" size="sm" c="dimmed">
                    {label}
                  </Text>
                  <Text component="dd" size="sm" m={0}>
                    {value}
                  </Text>
                </Group>
              ))}
            </Stack>
          ))}
        </Group>
      </Stack>
    </Paper>
  );
}
