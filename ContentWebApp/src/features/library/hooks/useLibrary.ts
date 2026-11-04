import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import {
  deleteContent,
  deleteCourse,
  getContentPage,
  getCourses,
  syncAllCourses,
  updateIvr,
} from '../api/library';
import { libraryKeys } from '../types/content.types';
import { combineStates, toApiState } from '@shared/utils/apiState';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useLibrary() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated';

  const content = useInfiniteQuery({
    queryKey: libraryKeys.content,
    queryFn: ({ pageParam }) => getContentPage(pageParam, 50),
    initialPageParam: '',
    getNextPageParam: (last) => last.pagination.next_cursor,
    enabled,
  });
  const courses = useInfiniteQuery({
    queryKey: libraryKeys.courses,
    queryFn: ({ pageParam }) => getCourses(pageParam, 50),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor,
    enabled,
  });

  useEffect(() => {
    content.hasNextPage && content.fetchNextPage();
    courses.hasNextPage && courses.fetchNextPage();
  }, [content.data, courses.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
  };

  const removeContent = useMutation({
    mutationFn: deleteContent,
    onSuccess: invalidate,
    onError: notifyApiError,
  });
  const removeCourse = useMutation({
    mutationFn: deleteCourse,
    onSuccess: invalidate,
    onError: notifyApiError,
  });
  const syncAll = useMutation({
    mutationFn: syncAllCourses,
    onSuccess: () => {
      notifications.show({ message: t('library.syncStarted') });
      invalidate();
    },
    onError: notifyApiError,
  });
  const refreshIvr = useMutation({
    mutationFn: updateIvr,
    onSuccess: (data) => {
      notifications.show({ message: data.message || t('library.ivrUpdated') });
      void queryClient.invalidateQueries({ queryKey: ['ivr'] });
    },
    onError: notifyApiError,
  });

  const state = combineStates({ content: toApiState(content), courses: toApiState(courses) });

  return {
    state,
    content: content.data?.pages.flatMap((page) => page.data) ?? [],
    courses: courses.data?.pages.flatMap((page) => page.courses) ?? [],
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
