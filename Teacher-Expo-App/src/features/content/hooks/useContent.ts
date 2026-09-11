import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getContent, getContentById, getContentSasUrl } from '../api/content';
import type { GetContentOptions } from '../types/content.types';

export function useContentList(filters: Omit<GetContentOptions, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['content', filters],
    queryFn: ({ pageParam }) => getContent({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });
}

export function useContentItem(contentId: string) {
  return useQuery({ queryKey: ['content', 'item', contentId], queryFn: () => getContentById(contentId) });
}

export function useContentAudioUrl(audioUrl: string | null) {
  return useQuery({
    queryKey: ['content', 'sasUrl', audioUrl],
    queryFn: () => getContentSasUrl(audioUrl as string),
    enabled: !!audioUrl,
  });
}
