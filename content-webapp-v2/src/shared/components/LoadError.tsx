import { Alert, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { toApiErrorMessage } from '@shared/utils/apiErrors';

export function LoadError({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message = toApiErrorMessage(error);
  return (
    message && (
      <Group gap="xs">
        <Alert>{message}</Alert>
        {onRetry && (
          <Button variant="subtle" size="xs" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </Group>
    )
  );
}
