import { Alert, Anchor, Breadcrumbs, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { deleteCourse, getCourse, syncCourse } from '../api/library';
import type { CourseDetail } from '../api/library';
import { libraryKeys } from '../types/content.types';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { disambiguateLabels } from '../utils/courseLabels';
import { BlockViewer } from '../components/BlockViewer';

function CourseContent({ course, id }: { course: CourseDetail; id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(-1);

  const remove = useMutation({
    mutationFn: () => deleteCourse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void navigate({ to: routePaths.library });
    },
    onError: notifyApiError,
  });

  const sync = useMutation({
    mutationFn: () => syncCourse(id),
    onSuccess: () => notifications.show({ message: t('library.syncStarted') }),
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

  const blocks = course.blocks;
  const labels = disambiguateLabels(blocks);

  return (
    <>
      <Title order={2}>{course.title || course.name}</Title>
      {course.description && <Text c="dimmed">{course.description}</Text>}
      <Group gap="md">
        <Button variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}>
          {t('library.syncCourse')}
        </Button>
        <Button variant="outline" onClick={confirmRemove}>
          {t('library.delete')}
        </Button>
        <Button component={Link} to={routePaths.library}>
          {t('library.done')}
        </Button>
      </Group>

      <Text fw={700}>{t('library.blocks')}</Text>
      {blocks.length === 0 && <Text c="dimmed">{t('library.noBlocks')}</Text>}
      {index === -1 && blocks.length > 0 && (
        <Stack gap="xs">
          {blocks.map((b, i) => (
            <Anchor key={b.block_id} component="button" type="button" fw={700} ta="left" onClick={() => setIndex(i)}>
              {i + 1}. {labels[i]}
            </Anchor>
          ))}
        </Stack>
      )}
      {index !== -1 && (
        <BlockViewer course={course} courseId={id} labels={labels} index={index} onSelect={setIndex} />
      )}
    </>
  );
}

export function CourseViewScreen() {
  const { t } = useTranslation();
  const { id = '' } = useParams({ strict: false });
  const status = useAuthStore((s) => s.status);

  const detail = useQuery({
    queryKey: libraryKeys.courseDetail(id),
    queryFn: () => getCourse(id),
    enabled: status === 'authenticated' && id !== '',
  });
  const loadError = toApiErrorMessage(detail.error);
  const course = detail.data;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{course?.title || course?.name || id}</Text>
      </Breadcrumbs>

      {detail.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && <Alert>{loadError}</Alert>}
      {!detail.isLoading && !course && !loadError && (
        <Text c="dimmed">{t('library.courseNotFound')}</Text>
      )}

      {course && <CourseContent course={course} id={id} />}
    </Stack>
  );
}
