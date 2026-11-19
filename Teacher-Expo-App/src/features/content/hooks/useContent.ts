import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getContent, getContentById, getContentSasUrl } from '../api/content';
import type { GetContentOptions } from '../types/content.types';

export function useContentList(filters: Omit<GetContentOptions, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['content', filters],
    queryFn: ({ pageParam }) => getContent({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    // The API keeps reporting hasMore with an unchanged cursor once the feed is
    // exhausted, so a repeated cursor is the real end-of-list signal.
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasMore && lastPage.nextCursor !== lastPageParam ? lastPage.nextCursor ?? undefined : undefined,
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
