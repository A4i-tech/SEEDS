import { Alert, Button, Group, Image, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiState } from '@shared/utils/apiState';
import { getArtifactMarkdown, getSourcePage, getSourcePdf, reviewKeys } from '../api/review';
import { pageContent, splitIntoPages, toPlainText } from '../utils/remediationPages';
import type { FrameSync } from '../hooks/useSyncedScroll';
import { ReviewFrame } from './ReviewFrame';

function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) return undefined;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function ScanImage({ jobId, pageNum }: { jobId: string; pageNum: number }) {
  const { t } = useTranslation();
  const page = useQuery({ queryKey: reviewKeys.sourcePage(jobId, pageNum), queryFn: () => getSourcePage(jobId, pageNum) });
  const url = useObjectUrl(page.data);
  const state = toApiState(page);
  if (state.status === 'error') return <Alert>{state.error.message}</Alert>;
  if (!url) return <Text c="dimmed">{t('review.scanLoading')}</Text>;
  return <Image src={url} alt={t('review.scanAlt', { page: pageNum })} />;
}

function ScanPdf({ jobId, pageNum }: { jobId: string; pageNum: number }) {
  const { t } = useTranslation();
  const pdf = useQuery({ queryKey: reviewKeys.sourcePdf(jobId), queryFn: () => getSourcePdf(jobId) });
  const url = useObjectUrl(pdf.data);
  const state = toApiState(pdf);
  if (state.status === 'error') return <Alert>{state.error.message}</Alert>;
  if (!url) return <Text c="dimmed">{t('review.scanLoading')}</Text>;
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {t('review.noPageImages')}
      </Text>
      <iframe key={pageNum} title={t('review.scanTitle')} src={`${url}#page=${pageNum}&view=Fit`} style={{ width: '100%', minHeight: 520, border: 'none' }} />
    </Stack>
  );
}

function OcrText({ jobId, pageIndex }: { jobId: string; pageIndex: number }) {
  const { t } = useTranslation();
  const raw = useQuery({ queryKey: reviewKeys.raw(jobId), queryFn: () => getArtifactMarkdown(jobId, 'raw') });
  const pages = useMemo(() => splitIntoPages(raw.data ?? ''), [raw.data]);
  const state = toApiState(raw);
  if (state.status === 'error') return <Alert>{state.error.message}</Alert>;
  if (state.status === 'loading') return <Text c="dimmed">{t('common.loading')}</Text>;
  return <Text style={{ whiteSpace: 'pre-wrap' }}>{toPlainText(pageContent(pages, pageIndex))}</Text>;
}

export function OriginalScan({
  jobId,
  pageIndex,
  pageNum,
  hasPageImages,
  sync,
}: {
  jobId: string;
  pageIndex: number;
  pageNum: number;
  hasPageImages: boolean;
  sync: FrameSync;
}) {
  const { t } = useTranslation();
  const [showOcr, setShowOcr] = useState(false);
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text variant="label">{t('review.scanTitle')}</Text>
        <Button variant="subtle" size="compact-sm" onClick={() => setShowOcr(!showOcr)}>
          {showOcr ? t('review.showScan') : t('review.showOcr')}
        </Button>
      </Group>
      <ReviewFrame label={t('review.scanTitle')} sync={sync}>
        {showOcr && <OcrText jobId={jobId} pageIndex={pageIndex} />}
        {!showOcr && hasPageImages && <ScanImage jobId={jobId} pageNum={pageNum} />}
        {!showOcr && !hasPageImages && <ScanPdf jobId={jobId} pageNum={pageNum} />}
      </ReviewFrame>
    </Stack>
  );
}
