import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { createRemediationJob } from '../api/remediation';
import { getLanguages } from '@shared/services/languages';

export function useRemediationUpload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);

  const languages = useQuery({
    queryKey: ['remediation', 'languages'],
    queryFn: getLanguages,
    enabled: status === 'authenticated',
  });

  const upload = useMutation({
    mutationFn: ({ file, targetLanguage }: { file: File; targetLanguage: string }) =>
      createRemediationJob(file, targetLanguage),
    onSuccess: (_jobId, { file }) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      notifications.show({ message: t('makeAccessible.uploaded', { name: file.name }) });
      void navigate(routePaths.jobs);
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });

  return { languages: languages.data ?? [], upload: upload.mutateAsync, isUploading: upload.isPending };
}
