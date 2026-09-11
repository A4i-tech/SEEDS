import { apiClient } from '@shared/services/apiClient';
import { contentPageSchema, contentSchema } from '../types/content.types';
import type { GetContentOptions } from '../types/content.types';

export async function getContent(options: GetContentOptions = {}) {
  const { language, theme, exp_name, only_teacher_app, ids, limit = 15, cursor } = options;
  const params: Record<string, string> = {};
  if (language) params.language = language;
  if (theme) params.theme = theme;
  if (exp_name) params.exp_name = exp_name;
  if (only_teacher_app !== undefined) params.only_teacher_app = String(only_teacher_app);
  if (ids?.length) params.ids = ids.join(',');
  if (limit) params.limit = String(limit);
  if (cursor) params.cursor = cursor;

  const { data } = await apiClient.get('/content', { params });
  const page = contentPageSchema.parse(data);
  return {
    items: page.data.filter((item) => item.type !== 'quiz').map((item) => contentSchema.parse(item)),
    nextCursor: page.pagination.next_cursor,
    hasMore: page.pagination.has_more,
  };
}

export async function getContentById(contentId: string) {
  const { data } = await apiClient.get(`/content/${contentId}`);
  const content = contentSchema.parse(data);
  if (content.type === 'quiz') {
    throw new Error('Quiz content is not supported.');
  }
  return content;
}

export async function getContentSasUrl(audioUrl: string) {
  const { data } = await apiClient.get('/content/sasUrl', { params: { url: audioUrl } });
  return data.url as string;
}
