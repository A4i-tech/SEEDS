import { Breadcrumbs, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getContentById } from '../api/library';
import { AudioPreview, QuizPreview } from '../components/ContentPreview';
import classes from './LibraryViewScreen.module.css';

const audioKinds = ['story', 'song', 'poem', 'snippet'];

export function LibraryViewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { kind = '', id = '' } = useParams({ strict: false });
  const status = useAuthStore((s) => s.status);

  const detail = useQuery({
    queryKey: ['library', 'content', id],
    queryFn: () => getContentById(id),
    enabled: status === 'authenticated' && kind !== 'course' && id !== '',
  });

  const item = detail.data;
  const loadError = toApiErrorMessage(detail.error);
  const mismatch = item && item.type !== kind;
  const processing = item && item.type !== 'quiz' && !item.is_processed;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{item?.title.english || id}</Text>
      </Breadcrumbs>

      {detail.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {kind === 'course' && (
        <Group gap="md">
          <Text c="dimmed">{t('library.courseMoved')}</Text>
          <Button variant="subtle" onClick={() => void navigate({ to: '/library/course/$id', params: { id } })}>
            {t('library.view')}
          </Button>
        </Group>
      )}
      {mismatch && (
        <Text c="red" role="alert">
          {t('library.wrongItem')}
        </Text>
      )}

      {item && !mismatch && kind !== 'course' && (
        <>
          <Text className={classes.eyebrow}>
            {t(`library.experiences.${item.type}`)} · {t('library.readOnly')}
          </Text>
          <Title order={2}>{item.title.english}</Title>
          <Group gap="md">
            <Button
              variant="outline"
              className={classes.secondaryButton}
              onClick={() => void navigate({ to: '/library/$kind/$id/edit', params: { kind: item.type, id: item.id } })}
            >
              {t('library.edit')}
            </Button>
            <Button className={classes.submitButton} onClick={() => void navigate({ to: routePaths.library })}>
              {t('library.done')}
            </Button>
          </Group>

          {processing && <Text c="dimmed">{t('library.processing')}</Text>}
          {!processing && kind === 'quiz' && item.type === 'quiz' && (
            <Stack gap="xs" className={classes.panel}>
              <Text fw={700}>{t('library.preview')}</Text>
              <QuizPreview item={item} />
            </Stack>
          )}
          {!processing && audioKinds.includes(kind) && item.type !== 'quiz' && (
            <Stack gap="xs" className={classes.panel}>
              <Text fw={700}>{t('library.preview')}</Text>
              {item.description && <Text>{item.description}</Text>}
              <AudioPreview item={item} />
            </Stack>
          )}
          {!processing && !audioKinds.includes(kind) && kind !== 'quiz' && (
            <Text c="dimmed">{t('library.unsupportedKind')}</Text>
          )}
          <Stack gap="xs" className={classes.panel}>
            <Text fw={700}>{t('library.metadata')}</Text>
            <Text size="sm">
              {t('library.metaKind')}: {t(`library.experiences.${item.type}`)}
            </Text>
            <Text size="sm">
              {t('library.metaTheme')}: {item.theme.english}
            </Text>
          </Stack>
        </>
      )}
    </Stack>
  );
}
