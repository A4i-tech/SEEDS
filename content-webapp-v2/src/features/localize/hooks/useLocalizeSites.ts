import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getLanguages } from '@shared/services/languages';
import { createSite, deleteSite, listSites, updateSite } from '../api/sites';
import type { WebsiteUpdate } from '../types/localize.types';

export function useLocalizeSites() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const enabled = authStatus === 'authenticated';

  const sites = useQuery({ queryKey: ['localize', 'sites'], queryFn: () => listSites(), enabled });
  const languages = useQuery({
    queryKey: ['localize', 'languages'],
    queryFn: () => getLanguages(),
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['localize'] });
  };

  const notifyError = (err: unknown) => {
    const message = toApiErrorMessage(err);
    if (message) notifications.show({ color: 'red', message });
  };

  const create = useMutation({
    mutationFn: createSite,
    onSuccess: () => {
      notifications.show({ message: t('localize.siteCreated') });
      invalidate();
    },
    onError: notifyError,
  });

  const update = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: WebsiteUpdate }) => updateSite(id, fields),
    onSuccess: () => {
      notifications.show({ message: t('localize.siteUpdated') });
      invalidate();
    },
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      notifications.show({ message: t('localize.siteDeleted') });
      invalidate();
    },
    onError: notifyError,
  });

  return {
    sites: sites.data ?? [],
    languages: languages.data ?? [],
    isLoading: sites.isLoading || languages.isLoading,
    error: sites.error ?? languages.error,
    create: create.mutateAsync,
    creating: create.isPending,
    update: update.mutateAsync,
    updating: update.isPending,
    remove: remove.mutateAsync,
  };
}
