import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { createRule, deleteRule, listRules, updateRule } from '../api/rules';
import { localizeKeys, type RuleFields } from '../types/localize.types';
import { toApiState } from '@shared/utils/apiState';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useLocalizeRules(siteId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);

  const list = useQuery({
    queryKey: localizeKeys.rules(siteId),
    queryFn: () => listRules(siteId),
    enabled: authStatus === 'authenticated' && siteId !== '',
  });

  const done = (key: string) => ({
    onSuccess: () => {
      notifications.show({ message: t(key) });
      void queryClient.invalidateQueries({ queryKey: localizeKeys.all });
    },
    onError: notifyApiError,
  });

  const create = useMutation({
    mutationFn: (fields: RuleFields) => createRule(siteId, fields),
    ...done('localize.ruleSaved'),
  });

  const update = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: RuleFields }) => updateRule(id, fields),
    ...done('localize.ruleSaved'),
  });

  const remove = useMutation({
    mutationFn: deleteRule,
    ...done('localize.ruleDeleted'),
  });

  const state = toApiState(list);

  return {
    state,
    rules: state.status === 'done' ? state.data : [],
    create: create.mutate,
    update: update.mutate,
    remove: remove.mutate,
    saving: create.isPending || update.isPending,
  };
}
