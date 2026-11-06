import { Alert, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiState } from '@shared/utils/apiState';
import { deleteContent, getContentById } from '../api/library';
import { CONTENT_UI, libraryKeys } from '../types/content.types';
import type { AudioContentItem, ContentItem } from '../types/content.types';
import { useLibraryAccess } from '../hooks/useLibraryAccess';
import { AudioPreview, QuizPreview } from '../components/ContentPreview';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { AppBreadcrumbs } from '@shared/components/AppBreadcrumbs';
import { PageTitle } from '@shared/components/PageTitle';

function DetailView({ item }: { item: ContentItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canModifyContent } = useLibraryAccess();
  const ui = CONTENT_UI[item.type];
  const processing = item.type !== 'quiz' && !item.is_processed;

  const remove = useMutation({
    mutationFn: () => deleteContent(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void navigate({ to: '/library' });
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

  return (
    <>
      <Text variant="eyebrow">
        {t(`library.experiences.${item.type}`)} · {t('library.readOnly')}
      </Text>
      <PageTitle title={item.title.english} />
      <Group gap="md">
        {canModifyContent(item.school_id) && (
          <>
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/library/$kind/$id/edit', params: { kind: item.type, id: item.id } })}
            >
              {t('library.edit')}
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              {t('library.delete')}
            </Button>
          </>
        )}
      </Group>

      {remove.error && <Alert>{remove.error.message}</Alert>}
      {processing && <Text c="dimmed">{t('library.processing')}</Text>}
      {!processing && (
        <>
          <Paper p="lg" radius="md">
            <Stack gap="xs">
              <Text variant="label">{t('library.preview')}</Text>
              {ui.preview === 'quiz' ? (
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
              <Text variant="label">{t('library.metadata')}</Text>
              <Stack gap="sm">
                <Stack gap={0}>
                  <Text size="xs" c="dimmed">
                    {t('library.metaKind')}
                  </Text>
                  <Text size="sm">{t(`library.experiences.${item.type}`)}</Text>
                </Stack>
                <Stack gap={0}>
                  <Text size="xs" c="dimmed">
                    {t('library.metaTheme')}
                  </Text>
                  <Text size="sm">{item.theme.english}</Text>
                </Stack>
                <Stack gap={0}>
                  <Text size="xs" c="dimmed">
                    {t('library.metaLanguage')}
                  </Text>
                  <Text size="sm">{item.language}</Text>
                </Stack>
              </Stack>
          </Stack>
          </Paper>
        </>
      )}
    </>
  );
}

export function LibraryDetailScreen() {
  const { t } = useTranslation();
  const { kind = '', id = '' } = useParams({ strict: false });
  const status = useAuthStore((s) => s.status);

  const detail = useQuery({
    queryKey: libraryKeys.contentDetail(id),
    queryFn: () => getContentById(id),
    enabled: status === 'authenticated' && kind !== 'course' && id !== '',
  });
  const detailState = toApiState(detail);

  return (
    <Stack gap="md">
      <AppBreadcrumbs crumbs={[{ label: t('library.title'), to: '/library' }, { label: detailState.status === 'done' ? detailState.data.title.english || id : id }]} />

      {detailState.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {detailState.status === 'error' && <Alert>{detailState.error.message}</Alert>}
      {detailState.status === 'done' && <DetailView key={detailState.data.id} item={detailState.data} />}
    </Stack>
  );
}
