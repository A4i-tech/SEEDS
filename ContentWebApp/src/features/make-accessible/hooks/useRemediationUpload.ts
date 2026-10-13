import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { createRemediationJob } from '../api/remediation';
import { useLanguages } from '@shared/hooks/useLanguages';
import { jobKeys } from '@features/jobs/types/job.types';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useRemediationUpload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state: languagesState, options: languageOptions } = useLanguages();
  const languagesError = languagesState.status === 'error' ? languagesState.error.message : '';

  const upload = useMutation({
    mutationFn: ({ file, targetLanguage }: { file: File; targetLanguage: string }) =>
      createRemediationJob(file, targetLanguage),
    onSuccess: (_jobId, { file }) => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.all });
      notifications.show({ message: t('makeAccessible.uploaded', { name: file.name }) });
      void navigate({ to: '/jobs' });
    },
    onError: notifyApiError,
  });

  return { languageOptions, languagesError, upload: upload.mutateAsync, isUploading: upload.isPending };
}
