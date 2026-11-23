import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { createRule, deleteRule, listRules, updateRule } from '../api/rules';
import { localizeKeys, type RuleFields } from '../types/localize.types';
import { toApiState } from '@shared/utils/apiState';
import { useMutationDone } from './useMutationDone';

export function useLocalizeRules(siteId: string) {
  const authStatus = useAuthStore((s) => s.status);

  const list = useQuery({
    queryKey: localizeKeys.rules(siteId),
    queryFn: () => listRules(siteId),
    enabled: authStatus === 'authenticated' && siteId !== '',
  });

  const done = useMutationDone([localizeKeys.rules(siteId), localizeKeys.reviews]);

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
