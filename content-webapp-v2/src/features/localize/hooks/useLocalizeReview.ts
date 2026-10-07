import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { generateForReview } from '../api/scripts';
import {
  approveTranslation,
  bulkApproveTranslations,
  listTranslations,
  updateTranslation,
} from '../api/review';
import { toSegment } from '../utils/segments';

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
    queryKey: ['localize', 'review', siteId, route],
    queryFn: () => listTranslations(siteId, route || undefined),
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['localize'] });
  };

  const notifyError = (err: unknown) => {
    const message = toApiErrorMessage(err);
    if (message) notifications.show({ color: 'red', message });
  };

  const generate = useMutation({
    mutationFn: () => generateForReview(siteId, route, lang),
    onSuccess: () => {
      notifications.show({ message: t('localize.generated') });
      invalidate();
    },
    onError: notifyError,
  });

  const saveEdit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      updateTranslation(id, { lang, text }),
    onSuccess: () => {
      notifications.show({ message: t('localize.saved') });
      invalidate();
    },
    onError: notifyError,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveTranslation(id, { lang }),
    onSuccess: () => {
      notifications.show({ message: t('localize.approved') });
      invalidate();
    },
    onError: notifyError,
  });

  const approveAll = useMutation({
    mutationFn: () =>
      bulkApproveTranslations(siteId, { route: route || undefined, lang: lang || undefined }),
    onSuccess: (result) => {
      notifications.show({ message: t('localize.approvedCount', { count: result.approved }) });
      invalidate();
    },
    onError: notifyError,
  });

  return {
    segments: (list.data ?? []).map((item) => toSegment(item, lang)),
    isLoading: list.isLoading,
    error: list.error,
    refetch: () => {
      void list.refetch();
    },
    generate: generate.mutateAsync,
    generating: generate.isPending,
    saveEdit: saveEdit.mutateAsync,
    approve: approve.mutateAsync,
    approveAll: approveAll.mutateAsync,
    approvingAll: approveAll.isPending,
  };
}
