import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { useLanguages } from '@shared/hooks/useLanguages';
import { createSite, deleteSite, listSites, updateSite } from '../api/sites';
import type { WebsiteUpdate } from '../types/localize.types';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useLocalizeSites() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const enabled = authStatus === 'authenticated';

  const sites = useQuery({ queryKey: ['localize', 'sites'], queryFn: () => listSites(), enabled });
  const { languages, isLoading: languagesLoading, error: languagesError } = useLanguages();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['localize'] });
  };

  const create = useMutation({
    mutationFn: createSite,
    onSuccess: () => {
      notifications.show({ message: t('localize.siteCreated') });
      invalidate();
    },
    onError: notifyApiError,
  });

  const update = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: WebsiteUpdate }) => updateSite(id, fields),
    onSuccess: () => {
      notifications.show({ message: t('localize.siteUpdated') });
      invalidate();
    },
    onError: notifyApiError,
  });

  const remove = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      notifications.show({ message: t('localize.siteDeleted') });
      invalidate();
    },
    onError: notifyApiError,
  });

  return {
    sites: sites.data ?? [],
    languages,
    isLoading: sites.isLoading || languagesLoading,
    error: sites.error ?? languagesError,
    create: create.mutateAsync,
    creating: create.isPending,
    update: update.mutateAsync,
    updating: update.isPending,
    remove: remove.mutateAsync,
  };
}
