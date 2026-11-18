import { Stack } from '@mantine/core';
import { joinSegments, splitSegments, type Segment } from '../utils/remediationFigures';
import { FigureBlock } from './FigureBlock';
import { MarkdownEditor } from './MarkdownEditor';

export function DraftPage({
  jobId,
  pageIndex,
  markdown,
  ariaLabel,
  onChange,
}: {
  jobId: string;
  pageIndex: number;
  markdown: string;
  ariaLabel: string;
  onChange: (markdown: string) => void;
}) {
  const segments = splitSegments(markdown);
  const update = (index: number, segment: Segment) =>
    onChange(joinSegments(segments.map((current, i) => (i === index ? segment : current))));

  return (
    <Stack gap="md">
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <MarkdownEditor
            key={`${pageIndex}:${index}`}
            value={segment.markdown}
            ariaLabel={ariaLabel}
            toolbar={index === 0}
            onChange={(next) => update(index, { type: 'text', markdown: next })}
          />
        ) : (
          <FigureBlock
            key={`${pageIndex}:${index}`}
            jobId={jobId}
            imageName={segment.imageName}
            figure={segment.figure}
            onChange={(figure) => update(index, { ...segment, figure })}
          />
        ),
      )}
    </Stack>
  );
}
