import { Anchor, Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { CourseBlock, CourseDetail } from '../api/library';
import { blockLabel } from '../utils/courseLabels';
import { ProblemBlock } from './ProblemBlock';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...defaultSchema.attributes!.img, 'width', 'height'],
    code: [['className', /^language-./, 'math-display', 'math-inline']],
  },
};

 function BlockBody({ block, courseId }: { block: CourseBlock; courseId: string }) {
  const { t } = useTranslation();
  const [videoSrc] = block.student_view_data.sources;
  if (block.type === 'problem') return <ProblemBlock block={block} courseId={courseId} />;
  if (block.type === 'video' && videoSrc) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <Box component="video" controls src={videoSrc} w="100%" />
    );
  }
  if (block.markdown) return (
      <Text component="div">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeKatex]}
        >
          {block.markdown}
        </ReactMarkdown>
      </Text>
    );
  return <Text c="dimmed">{t('library.blockNoPreview')}</Text>;
}

export function BlockViewer({
  course,
  courseId,
  index,
  onSelect,
}: {
  course: CourseDetail;
  courseId: string;
  index: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  const block = course.blocks[index];

  return (
    <>
      <Group gap={4} wrap="nowrap">
        <ArrowLeft size={16} aria-hidden />
        <Anchor component="button" type="button" size="sm" variant="rowAction" onClick={() => onSelect(-1)}>
          {t('library.courseOutline')}
        </Anchor>
      </Group>
      <Group gap="xs">
        <Button variant="subtle" size="sm" disabled={index === 0} onClick={() => onSelect(index - 1)}>
          {t('common.previous')}
        </Button>
        <Text size="sm" c="dimmed">
          {t('common.rangeOf', { start: index + 1, end: index + 1, total: course.blocks.length })}
        </Text>
        <Button
          variant="subtle"
          size="sm"
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
