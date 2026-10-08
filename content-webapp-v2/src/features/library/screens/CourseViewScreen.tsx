import { Breadcrumbs, Button, Group, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { deleteCourse, getCourse, syncCourse, updateProblemBlock } from '../api/library';
import type { CourseBlock, CourseDetail } from '../api/library';
import classes from './CourseViewScreen.module.css';
import { notifyApiError } from '@shared/utils/notifyApiError';

function blockLabel(block: CourseBlock): string {
  return block.display_name || block.type;
}

function disambiguateLabels(blocks: CourseBlock[]): string[] {
  const labels = blocks.map(blockLabel);
  return labels.map((label, i) => {
    if (labels.filter((l) => l === label).length <= 1) return label;
    return `${label} ${labels.slice(0, i + 1).filter((l) => l === label).length}`;
  });
}

function ProblemBlock({ block, courseId }: { block: CourseBlock; courseId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      updateProblemBlock(courseId, block.block_id, {
        question,
        choices: block.choices.map((c, i) => ({ value: c.value, text: choices[i] })),
      }),
    onSuccess: () => {
      queryClient.setQueryData<CourseDetail>(
        ['library', 'course', courseId],
        (prev) =>
          prev && {
            ...prev,
            blocks: prev.blocks.map((b) => {
              if (b.block_id !== block.block_id) return b;
              return { ...b, question, choices: b.choices.map((c, i) => ({ ...c, text: choices[i] })) };
            }),
          },
      );
      setEditing(false);
    },
    onError: (err) => setSaveError(toApiErrorMessage(err)),
  });

  if (!block.question || !block.choices.length) {
    return <Text c="dimmed">{t('library.blockNoPreview')}</Text>;
  }

  if (!editing) {
    return (
      <Stack gap="xs">
        <Text fw={700}>{block.question}</Text>
        {block.choices.map((c) => (
          <Text key={c.value} size="sm" c="dimmed">
            {c.text}
          </Text>
        ))}
        <Group gap="xs">
          <button
            type="button"
            className={classes.rowAction}
            onClick={() => {
              setQuestion(block.question);
              setChoices(block.choices.map((c) => c.text));
              setSaveError('');
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
          key={block.choices[i].value}
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

function BlockBody({ block, courseId }: { block: CourseBlock; courseId: string }) {
  const { t } = useTranslation();
  const [videoSrc] = block.student_view_data.sources;
  if (block.type === 'problem') return <ProblemBlock block={block} courseId={courseId} />;
  if (block.type === 'video' && videoSrc) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video controls src={videoSrc} className={classes.player} />
    );
  }
  if (block.markdown) return <Text>{block.markdown}</Text>;
  return <Text c="dimmed">{t('library.blockNoPreview')}</Text>;
}

function BlockViewer({
  course,
  courseId,
  labels,
  index,
  onSelect,
}: {
  course: CourseDetail;
  courseId: string;
  labels: string[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  const block = course.blocks[index];

  return (
    <>
      <Breadcrumbs aria-label="Breadcrumb">
        <button type="button" className={classes.rowAction} onClick={() => onSelect(-1)}>
          {course.title || course.name}
        </button>
        <Text>{labels[index]}</Text>
      </Breadcrumbs>
      <Group gap="xs">
        <Button variant="subtle" size="xs" disabled={index === 0} onClick={() => onSelect(index - 1)}>
          {t('common.previous')}
        </Button>
        <Text size="sm" c="dimmed">
          {t('common.rangeOf', { start: index + 1, end: index + 1, total: course.blocks.length })}
        </Text>
        <Button
          variant="subtle"
          size="xs"
          disabled={index === course.blocks.length - 1}
          onClick={() => onSelect(index + 1)}
        >
          {t('common.next')}
        </Button>
      </Group>
      <Stack gap="xs" className={classes.panel}>
        <Text className={classes.eyebrow}>
          {blockLabel(block)} · {block.type}
        </Text>
        <BlockBody block={block} courseId={courseId} />
      </Stack>
    </>
  );
}

function CourseContent({ course, id }: { course: CourseDetail; id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(-1);

  const remove = useMutation({
    mutationFn: () => deleteCourse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] });
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
      onConfirm: () => void remove.mutateAsync(),
    });
  };

  const blocks = course.blocks;
  const labels = disambiguateLabels(blocks);

  return (
    <>
      <Title order={2}>{course.title || course.name}</Title>
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
        <Button className={classes.submitButton} onClick={() => void navigate({ to: routePaths.library })}>
          {t('library.done')}
        </Button>
      </Group>

      <Text fw={700}>{t('library.blocks')}</Text>
      {blocks.length === 0 && <Text c="dimmed">{t('library.noBlocks')}</Text>}
      {index === -1 && blocks.length > 0 && (
        <Stack gap="xs">
          {blocks.map((b, i) => (
            <button key={b.block_id} type="button" className={classes.rowAction} onClick={() => setIndex(i)}>
              {i + 1}. {labels[i]}
            </button>
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
    queryKey: ['library', 'course', id],
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
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {!detail.isLoading && !course && !loadError && (
        <Text c="dimmed">{t('library.courseNotFound')}</Text>
      )}

      {course && <CourseContent course={course} id={id} />}
    </Stack>
  );
}
