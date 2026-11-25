import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useLanguages } from '@shared/hooks/useLanguages';
import { createSite, deleteSite, listSites, updateSite } from '../api/sites';
import { localizeKeys, type WebsiteFields } from '../types/localize.types';
import { toApiState } from '@shared/utils/apiState';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useLocalizeSites() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const sites = useQuery({ queryKey: localizeKeys.sites, queryFn: listSites });
  const { state: languagesState, languages } = useLanguages();

  const state = toApiState(sites);
  const languageName = (code: string) => languages.find((l) => l.code === code)?.name ?? code;

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

  const create = useMutation({
    mutationFn: createSite,
    ...done('localize.siteCreated'),
  });

  const update = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: WebsiteFields }) => updateSite(id, fields),
    ...done('localize.siteUpdated'),
  });

  const remove = useMutation({
    mutationFn: deleteSite,
    ...done('localize.siteDeleted'),
  });

  return {
    state,
    languagesState,
    sites: state.status === 'done' ? state.data : [],
    languages,
    languageName,
    create: create.mutate,
    creating: create.isPending,
    update: update.mutate,
    updating: update.isPending,
    remove: remove.mutate,
  };
}
