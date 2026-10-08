import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import {
  deleteContent,
  deleteCourse,
  getContentPage,
  getCourses,
  syncAllCourses,
  updateIvr,
} from '../api/library';

export function useLibrary() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated';

  const content = useQuery({
    queryKey: ['library', 'content'],
    queryFn: () => getContentPage(undefined, 50),
    enabled,
  });
  const courses = useQuery({
    queryKey: ['library', 'courses'],
    queryFn: () => getCourses(undefined, 50),
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['library'] });
  };

  const notifyError = (err: unknown) => {
    const message = toApiErrorMessage(err);
    if (message) notifications.show({ color: 'red', message });
  };

  const removeContent = useMutation({
    mutationFn: deleteContent,
    onSuccess: invalidate,
    onError: notifyError,
  });
  const removeCourse = useMutation({
    mutationFn: deleteCourse,
    onSuccess: invalidate,
    onError: notifyError,
  });
  const syncAll = useMutation({
    mutationFn: syncAllCourses,
    onSuccess: () => {
      notifications.show({ message: t('library.syncStarted') });
      invalidate();
    },
    onError: notifyError,
  });
  const refreshIvr = useMutation({
    mutationFn: updateIvr,
    onSuccess: (data) => {
      notifications.show({ message: data.message || t('library.ivrUpdated') });
    },
    onError: notifyError,
  });

  return {
    content: content.data?.data ?? [],
    courses: courses.data?.courses ?? [],
    isLoading: content.isLoading || courses.isLoading,
    error: content.error ?? courses.error,
    reload: () => {
      void content.refetch();
      void courses.refetch();
    },
    removeContent: removeContent.mutateAsync,
    removeCourse: removeCourse.mutateAsync,
    syncAll: syncAll.mutateAsync,
    syncingAll: syncAll.isPending,
    refreshIvr: refreshIvr.mutateAsync,
  };
}
