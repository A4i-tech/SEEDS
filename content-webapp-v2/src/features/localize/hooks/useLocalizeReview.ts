import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { generateForReview } from '../api/scripts';
import {
  approveTranslation,
  bulkApproveTranslations,
  listTranslations,
  updateTranslation,
} from '../api/review';
import { toSegment } from '../utils/segments';
import { localizeKeys } from '../types/localize.types';
import { notifyApiError } from '@shared/utils/notifyApiError';

export interface LocalizeReviewScope {
  siteId: string;
  route: string;
  lang: string;
}

export function useLocalizeReview({ siteId, route, lang }: LocalizeReviewScope) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const enabled = authStatus === 'authenticated' && siteId !== '';

  const list = useQuery({
    queryKey: localizeKeys.review(siteId, route),
    queryFn: () => listTranslations(siteId, route || undefined),
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: localizeKeys.all });
  };

  const done = (key: string) => ({
    onSuccess: () => {
      notifications.show({ message: t(key) });
      invalidate();
    },
    onError: notifyApiError,
  });

  const generate = useMutation({
    mutationFn: () => generateForReview(siteId, route, lang),
    ...done('localize.generated'),
  });

  const saveEdit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      updateTranslation(id, { lang, text }),
    ...done('localize.saved'),
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveTranslation(id, { lang }),
    ...done('localize.approved'),
  });

  const approveAll = useMutation({
    mutationFn: () =>
      bulkApproveTranslations(siteId, { route: route || undefined, lang: lang || undefined }),
    onSuccess: (result) => {
      notifications.show({ message: t('localize.approvedCount', { count: result.approved }) });
      invalidate();
    },
    onError: notifyApiError,
  });

  return {
    segments: (list.data ?? []).map((item) => toSegment(item, lang)),
    isLoading: list.isLoading,
    error: list.error,
    generate: generate.mutate,
    generating: generate.isPending,
    saveEdit: saveEdit.mutate,
    approve: approve.mutate,
    approveAll: approveAll.mutate,
    approvingAll: approveAll.isPending,
  };
}
