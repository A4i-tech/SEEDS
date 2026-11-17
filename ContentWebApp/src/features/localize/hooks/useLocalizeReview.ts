import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
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
import { localizeKeys, type TranslationItem } from '../types/localize.types';
import { toApiState } from '@shared/utils/apiState';
import { notifyApiError } from '@shared/utils/notifyApiError';

 interface LocalizeReviewScope {
  siteId: string;
  route: string;
  lang: string;
}

export function useLocalizeReview({ siteId, route, lang }: LocalizeReviewScope) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const enabled = authStatus === 'authenticated' && siteId !== '' && route !== '';

  const list = useQuery({
    queryKey: localizeKeys.review(siteId, route),
    queryFn: () => listTranslations(siteId, route),
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: localizeKeys.reviews });
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

  const requested = useRef('');
  const scope = `${siteId}|${route}|${lang}`;
  const missing = lang !== '' && list.data?.some((item) => !item.translations[lang]?.text);

  useEffect(() => {
    if (!missing || requested.current === scope) return;
    requested.current = scope;
    generate.mutate();
  }, [missing, scope, generate]);

  const patchItems = (items: TranslationItem[]) => {
    queryClient.setQueryData<TranslationItem[]>(localizeKeys.review(siteId, route), (current) =>
      current?.map((item) => items.find((next) => next.id === item.id) ?? item),
    );
  };

  const saveEdit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => updateTranslation(id, { lang, text }),
    onSuccess: (item) => {
      notifications.show({ message: t('localize.saved') });
      patchItems([item]);
    },
    onError: notifyApiError,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveTranslation(id, { lang }),
    onSuccess: (item) => {
      notifications.show({ message: t('localize.approved') });
      patchItems([item]);
    },
    onError: notifyApiError,
  });

  const approveAll = useMutation({
    mutationFn: async ({ ids, whole }: { ids: string[]; whole: boolean }) => {
      if (whole) return { ...(await bulkApproveTranslations(siteId, { route, lang })), items: [] };
      const results = await Promise.allSettled(ids.map((id) => approveTranslation(id, { lang })));
      const items = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      return { approved: items.length, skipped: 0, failed: ids.length - items.length, items };
    },
    onSuccess: ({ approved, skipped, failed, items }, { whole }) => {
      const key = failed || skipped ? 'localize.approvedPartial' : 'localize.approvedCount';
      notifications.show({ message: t(key, { count: approved, approved, skipped, failed }), color: failed ? 'red' : undefined });
      if (whole) invalidate();
      else patchItems(items);
    },
    onError: notifyApiError,
  });

  const state = toApiState(list);

  return {
    state,
    segments: (state.status === 'done' ? state.data : []).map((item) => toSegment(item, lang)),
    generating: generate.isPending,
    saveEdit: saveEdit.mutate,
    approve: approve.mutate,
    approveAll: approveAll.mutate,
    approvingAll: approveAll.isPending,
  };
}
