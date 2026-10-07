import { Breadcrumbs, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { deleteContent, getContentById } from '../api/library';
import { AudioPreview, QuizPreview } from '../components/ContentPreview';
import classes from './LibraryDetailScreen.module.css';

export function LibraryDetailScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { kind = '', id = '' } = useParams({ strict: false });
  const status = useAuthStore((s) => s.status);
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['library', 'content', id],
    queryFn: () => getContentById(id),
    enabled: status === 'authenticated' && kind !== 'course' && id !== '',
  });

  const remove = useMutation({
    mutationFn: () => deleteContent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void navigate({ to: routePaths.library });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });

  const confirmRemove = () => {
    openConfirmDialog({
      title: t('library.deleteTitle'),
      body: t('library.deleteBody'),
      confirmLabel: t('library.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => void remove.mutateAsync().catch((err: unknown) => setError(toApiErrorMessage(err))),
    });
  };

  const item = detail.data;
  const processing = item && item.type !== 'quiz' && !item.is_processed;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{item?.title?.english ?? id}</Text>
      </Breadcrumbs>

      {detail.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}

      {item && (
        <>
          <Text className={classes.eyebrow}>
            {t(`library.experiences.${item.type}`)} · {t('library.readOnly')}
          </Text>
          <Title order={2}>{item.title?.english}</Title>
          <Group gap="md">
            <Button
              variant="outline"
              className={classes.secondaryButton}
              onClick={() => void navigate({ to: '/library/$kind/$id/edit', params: { kind: item.type, id: item.id } })}
            >
              {t('library.edit')}
            </Button>
            <Button
              variant="outline"
              className={classes.secondaryButton}
              onClick={confirmRemove}
            >
              {t('library.delete')}
            </Button>
            <Button className={classes.submitButton} onClick={() => void navigate({ to: routePaths.library })}>
              {t('library.done')}
            </Button>
          </Group>

          {processing && <Text c="dimmed">{t('library.processing')}</Text>}
          {!processing && (
            <>
              <Stack gap="xs" className={classes.panel}>
                <Text fw={700}>{t('library.preview')}</Text>
                {item.type === 'quiz' ? (
                  <QuizPreview item={item} />
                ) : (
                  <>
                    {item.description && <Text>{item.description}</Text>}
                    <AudioPreview item={item} />
                  </>
                )}
                <Text size="sm" c="dimmed">
                  {t('library.readOnlyNote')}
                </Text>
              </Stack>
              <Stack gap="xs" className={classes.panel}>
                <Text fw={700}>{t('library.metadata')}</Text>
                <Text size="sm">
                  {t('library.metaKind')}: {t(`library.experiences.${item.type}`)}
                </Text>
                <Text size="sm">
                  {t('library.metaTheme')}: {item.theme?.english ?? ''}
                </Text>
              </Stack>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
