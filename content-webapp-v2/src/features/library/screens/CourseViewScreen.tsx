import { Breadcrumbs, Button, Group, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { deleteCourse, getCourse, syncCourse, updateProblemBlock } from '../api/library';
import type { CourseBlock } from '../api/library';
import classes from './CourseViewScreen.module.css';

function disambiguateLabels(blocks: CourseBlock[]): string[] {
  const totals: Record<string, number> = {};
  for (const b of blocks) {
    const label = b.display_name ?? b.type;
    totals[label] = (totals[label] ?? 0) + 1;
  }
  const running: Record<string, number> = {};
  return blocks.map((b) => {
    const label = b.display_name ?? b.type;
    if ((totals[label] ?? 0) <= 1) return label;
    running[label] = (running[label] ?? 0) + 1;
    return `${label} ${running[label]}`;
  });
}

function ProblemBlock({ block, courseId }: { block: CourseBlock; courseId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateProblemBlock(courseId, block.block_id, {
        question,
        choices: (block.choices ?? []).map((c, i) => ({ value: c.value, text: choices[i] ?? '' })),
      }),
    onSuccess: () => {
      queryClient.setQueryData(['library', 'course', courseId], (prev: unknown) => {
        if (!prev || typeof prev !== 'object' || !('blocks' in prev)) return prev;
        const detail = prev as { blocks?: CourseBlock[] };
        return {
          ...detail,
          blocks: (detail.blocks ?? []).map((b) =>
            b.block_id === block.block_id
              ? {
                  ...b,
                  question,
                  choices: (b.choices ?? []).map((c, i) => ({ ...c, text: choices[i] ?? '' })),
                }
              : b,
          ),
        };
      });
      setEditing(false);
    },
    onError: (err) => setSaveError(toApiErrorMessage(err)),
  });

  if (!block.question || !block.choices?.length) {
    return <Text c="dimmed">{t('library.blockNoPreview')}</Text>;
  }

  if (!editing) {
    return (
      <Stack gap="xs">
        <Text fw={700}>{block.question}</Text>
        {(block.choices ?? []).map((c) => (
          <Text key={c.value} size="sm" c="dimmed">
            {c.text}
          </Text>
        ))}
        <Group gap="xs">
          <button
            type="button"
            className={classes.rowAction}
            onClick={() => {
              setQuestion(block.question ?? '');
              setChoices((block.choices ?? []).map((c) => c.text));
              setSaveError(null);
              setEditing(true);
            }}
          >
            {t('library.edit')}
          </button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Textarea
        label={t('library.questionLabel')}
        value={question}
        onChange={(e) => setQuestion(e.currentTarget.value)}
      />
      {choices.map((text, i) => (
        <TextInput
          key={block.choices?.[i]?.value ?? i}
          label={t('library.choiceN', { n: i + 1 })}
          value={text}
          onChange={(e) => setChoices((prev) => prev.map((c, idx) => (idx === i ? e.currentTarget.value : c)))}
        />
      ))}
      {saveError && (
        <Text c="red" role="alert">
          {saveError}
        </Text>
      )}
      <Group gap="xs">
        <Button className={classes.submitButton} loading={save.isPending} onClick={() => void save.mutateAsync()}>
          {t('library.save')}
        </Button>
        <Button variant="subtle" onClick={() => setEditing(false)}>
          {t('dialog.cancel')}
        </Button>
      </Group>
    </Stack>
  );
}

export function CourseViewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id = '' } = useParams();
  const status = useAuthStore((s) => s.status);
  const [index, setIndex] = useState<number | null>(null);

  const detail = useQuery({
    queryKey: ['library', 'course', id],
    queryFn: () => getCourse(id),
    enabled: status === 'authenticated' && id !== '',
  });
  const loadError = toApiErrorMessage(detail.error);

  const remove = useMutation({
    mutationFn: () => deleteCourse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void navigate(routePaths.library);
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });

  const sync = useMutation({
    mutationFn: () => syncCourse(id),
    onSuccess: () => notifications.show({ message: t('library.syncStarted') }),
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
      onConfirm: () => void remove.mutateAsync(),
    });
  };

  const course = detail.data;
  const blocks = course?.blocks ?? [];
  const labels = disambiguateLabels(blocks);
  const block = index === null ? null : (blocks[index] ?? null);
  const videoSrc = block?.student_view_data?.sources?.[0] ?? null;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{course?.title ?? course?.name ?? id}</Text>
      </Breadcrumbs>

      {detail.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {!detail.isLoading && !course && !loadError && (
        <Text c="dimmed">{t('library.courseNotFound')}</Text>
      )}

      {course && (
        <>
          <Title order={2}>{course.title ?? course.name}</Title>
          {course.description && <Text c="dimmed">{course.description}</Text>}
          <Group gap="md">
            <Button
              variant="outline"
              className={classes.secondaryButton}
              loading={sync.isPending}
              onClick={() => void sync.mutateAsync()}
            >
              {t('library.syncCourse')}
            </Button>
            <Button variant="outline" className={classes.secondaryButton} onClick={confirmRemove}>
              {t('library.delete')}
            </Button>
            <Button className={classes.submitButton} onClick={() => void navigate(routePaths.library)}>
              {t('library.done')}
            </Button>
          </Group>

          <Text fw={700}>{t('library.blocks')}</Text>
          {blocks.length === 0 && <Text c="dimmed">{t('library.noBlocks')}</Text>}
          {index === null && blocks.length > 0 && (
            <Stack gap="xs">
              {blocks.map((b, i) => (
                <button key={b.block_id} type="button" className={classes.rowAction} onClick={() => setIndex(i)}>
                  {i + 1}. {labels[i]}
                </button>
              ))}
            </Stack>
          )}
          {block && (
            <>
              <Breadcrumbs aria-label="Breadcrumb">
                <button type="button" className={classes.rowAction} onClick={() => setIndex(null)}>
                  {course.title ?? course.name}
                </button>
                <Text>{labels[index ?? 0]}</Text>
              </Breadcrumbs>
              <Group gap="xs">
                <Button variant="subtle" size="xs" disabled={index === 0} onClick={() => setIndex((index ?? 1) - 1)}>
                  {t('common.previous')}
                </Button>
                <Text size="sm" c="dimmed">
                  {t('common.rangeOf', { start: (index ?? 0) + 1, end: (index ?? 0) + 1, total: blocks.length })}
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  disabled={index === blocks.length - 1}
                  onClick={() => setIndex((index ?? 0) + 1)}
                >
                  {t('common.next')}
                </Button>
              </Group>
              <Stack gap="xs" className={classes.panel}>
                <Text className={classes.eyebrow}>
                  {block.display_name ?? block.type} · {block.type}
                </Text>
                {block.type === 'problem' && <ProblemBlock block={block} courseId={id} />}
                {block.type === 'video' && videoSrc && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video controls src={videoSrc} className={classes.player} />
                )}
                {block.type !== 'problem' && !(block.type === 'video' && videoSrc) && block.markdown && (
                  <Text>{block.markdown}</Text>
                )}
                {block.type !== 'problem' && !(block.type === 'video' && videoSrc) && !block.markdown && (
                  <Text c="dimmed">{t('library.blockNoPreview')}</Text>
                )}
              </Stack>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
