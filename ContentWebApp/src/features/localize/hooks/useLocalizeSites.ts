import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLanguages } from '@shared/hooks/useLanguages';
import { createSite, deleteSite, listSites, updateSite } from '../api/sites';
import { localizeKeys, type WebsiteFields } from '../types/localize.types';
import { toApiState } from '@shared/utils/apiState';
import { useMutationDone } from './useMutationDone';

export function useLocalizeSites() {
  const { t } = useTranslation();

  const sites = useQuery({ queryKey: localizeKeys.sites, queryFn: listSites });
  const { state: languagesState, languages } = useLanguages();

  const state = toApiState(sites);
  const languageName = (code: string) => languages.find((l) => l.code === code)?.name ?? code;

  const done = useMutationDone([localizeKeys.all]);

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
