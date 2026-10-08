import { Anchor, Box, Breadcrumbs, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { CourseBlock, CourseDetail } from '../api/library';
import { blockLabel } from '../utils/courseLabels';
import { ProblemBlock } from './ProblemBlock';

export function BlockBody({ block, courseId }: { block: CourseBlock; courseId: string }) {
  const { t } = useTranslation();
  const [videoSrc] = block.student_view_data.sources;
  if (block.type === 'problem') return <ProblemBlock block={block} courseId={courseId} />;
  if (block.type === 'video' && videoSrc) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <Box component="video" controls src={videoSrc} w="100%" />
    );
  }
  if (block.markdown) return <Text>{block.markdown}</Text>;
  return <Text c="dimmed">{t('library.blockNoPreview')}</Text>;
}

export function BlockViewer({
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
        <Anchor component="button" type="button" fw={700} onClick={() => onSelect(-1)}>
          {course.title || course.name}
        </Anchor>
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
      <Paper p="lg" radius="md">
        <Stack gap="xs">
          <Text variant="eyebrow">
            {blockLabel(block)} · {block.type}
          </Text>
          <BlockBody block={block} courseId={courseId} />
        </Stack>
      </Paper>
    </>
  );
}
