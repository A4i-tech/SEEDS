import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { createRemediationJob } from '../api/remediation';
import { useLanguages } from '@shared/hooks/useLanguages';

export function useRemediationUpload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { options: languageOptions } = useLanguages();

  const upload = useMutation({
    mutationFn: ({ file, targetLanguage }: { file: File; targetLanguage: string }) =>
      createRemediationJob(file, targetLanguage),
    onSuccess: (_jobId, { file }) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      notifications.show({ message: t('makeAccessible.uploaded', { name: file.name }) });
      void navigate({ to: routePaths.jobs });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });

  return { languageOptions, upload: upload.mutateAsync, isUploading: upload.isPending };
}
