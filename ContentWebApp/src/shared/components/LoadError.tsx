import { Alert, Button, Group } from '@mantine/core';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function LoadError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    console.error(String(error));
  }, [error]);
  return (
    <Group gap="xs">
      <Alert>{t('common.loadFailed')}</Alert>
      {onRetry && (
        <Button variant="subtle" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </Group>
  );
}
