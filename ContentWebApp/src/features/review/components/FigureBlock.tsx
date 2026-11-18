import { Image, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiState } from '@shared/utils/apiState';
import { getRemediationImage, reviewKeys } from '../api/review';
import type { Figure } from '../utils/remediationFigures';

function FigureImage({ jobId, imageName, alt }: { jobId: string; imageName: string; alt: string }) {
  const image = useQuery({
    queryKey: reviewKeys.image(jobId, imageName),
    queryFn: () => getRemediationImage(jobId, imageName),
  });
  useEffect(
    () => () => {
      if (image.data) URL.revokeObjectURL(image.data);
    },
    [image.data],
  );
  const imageState = toApiState(image);
  if (imageState.status === 'error') return <Text c="red" role="alert">{imageState.error.message}</Text>;
  if (imageState.status !== 'done') return <></>;
  return <Image src={imageState.data} alt={alt} radius="sm" maw={360} />;
}

export function FigureBlock({
  jobId,
  imageName,
  figure,
  onChange,
}: {
  jobId: string;
  imageName: string;
  figure: Figure;
  onChange: (figure: Figure) => void;
}) {
  const { t } = useTranslation();
  const commit = (next: Partial<Figure>) => {
    const merged = { ...figure, ...next };
    if (merged.alt !== figure.alt || merged.description !== figure.description) onChange(merged);
  };
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs" key={`${figure.alt}\n${figure.description}`}>
        <Text variant="label">{t('review.chips.figure')}</Text>
        <FigureImage jobId={jobId} imageName={imageName} alt={figure.alt} />
        <TextInput label={t('review.figureAlt')} defaultValue={figure.alt} onBlur={(e) => commit({ alt: e.currentTarget.value })} />
        <Textarea
          label={t('review.figureDescription')}
          autosize
          minRows={2}
          defaultValue={figure.description}
          onBlur={(e) => commit({ description: e.currentTarget.value })}
        />
      </Stack>
    </Paper>
  );
}
