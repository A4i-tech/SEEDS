import { Alert, Breadcrumbs, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { deleteContent, getContentById } from '../api/library';
import { CONTENT_UI, libraryKeys } from '../types/content.types';
import type { AudioContentItem, ContentItem } from '../types/content.types';
import { AudioPreview, QuizPreview } from '../components/ContentPreview';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function LibraryDetailScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { kind = '', id = '' } = useParams({ strict: false });
  const status = useAuthStore((s) => s.status);

  const detail = useQuery({
    queryKey: libraryKeys.contentDetail(id),
    queryFn: () => getContentById(id),
    enabled: status === 'authenticated' && kind !== 'course' && id !== '',
  });

  const remove = useMutation({
    mutationFn: () => deleteContent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void navigate({ to: routePaths.library });
    },
    onError: notifyApiError,
  });

  const confirmRemove = () => {
    openConfirmDialog({
      title: t('library.deleteTitle'),
      body: t('library.deleteBody'),
      confirmLabel: t('library.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => remove.mutate(),
    });
  };

  const item = detail.data;
  const ui = item ? CONTENT_UI[item.type] : undefined;
  const error = toApiErrorMessage(remove.error);
  const processing = item && item.type !== 'quiz' && !item.is_processed;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{item?.title.english || id}</Text>
      </Breadcrumbs>

      {detail.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {error && <Alert>{error}</Alert>}

      {item && (
        <>
          <Text variant="eyebrow">
            {t(`library.experiences.${item.type}`)} · {t('library.readOnly')}
          </Text>
          <Title order={2}>{item.title.english}</Title>
          <Group gap="md">
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/library/$kind/$id/edit', params: { kind: item.type, id: item.id } })}
            >
              {t('library.edit')}
            </Button>
            <Button variant="outline" onClick={confirmRemove}>
              {t('library.delete')}
            </Button>
            <Button component={Link} to={routePaths.library}>
              {t('library.done')}
            </Button>
          </Group>

          {processing && <Text c="dimmed">{t('library.processing')}</Text>}
          {!processing && (
            <>
              <Paper p="lg" radius="md">
                <Stack gap="xs">
                  <Text fw={700}>{t('library.preview')}</Text>
                  {ui?.preview === 'quiz' ? (
                    <QuizPreview item={item as Extract<ContentItem, { type: 'quiz' }>} />
                  ) : (
                    <>
                      {item.description && <Text>{item.description}</Text>}
                      <AudioPreview item={item as AudioContentItem} />
                    </>
                  )}
                  <Text size="sm" c="dimmed">
                    {t('library.readOnlyNote')}
                </Text>
              </Stack>
                </Paper>
                <Paper p="lg" radius="md">
                <Stack gap="xs">
                  <Text fw={700}>{t('library.metadata')}</Text>
                  <Text size="sm">
                    {t('library.metaKind')}: {t(`library.experiences.${item.type}`)}
                  </Text>
                  <Text size="sm">
                  {t('library.metaTheme')}: {item.theme.english}
                </Text>
              </Stack>
              </Paper>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
