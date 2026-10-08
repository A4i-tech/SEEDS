import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { useLanguages } from '@shared/hooks/useLanguages';
import { createSite, deleteSite, listSites, updateSite } from '../api/sites';
import { localizeKeys, type WebsiteFields } from '../types/localize.types';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useLocalizeSites() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const enabled = authStatus === 'authenticated';

  const sites = useQuery({ queryKey: localizeKeys.sites, queryFn: listSites, enabled });
  const { languages, isLoading: languagesLoading, error: languagesError } = useLanguages();

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
    sites: sites.data ?? [],
    languages,
    languageName,
    isLoading: sites.isLoading || languagesLoading,
    error: sites.error ?? languagesError,
    create: create.mutate,
    creating: create.isPending,
    update: update.mutate,
    updating: update.isPending,
    remove: remove.mutate,
  };
}
