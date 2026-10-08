import { Alert, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function LoadError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Group gap="xs">
      <Alert>{error.message}</Alert>
      {onRetry && (
        <Button variant="subtle" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </Group>
  );
}
