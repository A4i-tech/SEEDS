import { z } from 'zod';

export const titleTextSchema = z.object({
  english: z.string().optional(),
  local: z.string().optional(),
  audio_url: z.string().optional(),
});

export const audioTrackSchema = z.object({
  audio_url: z.string().optional(),
  description: z.string().optional(),
  duration_seconds: z.number().optional(),
});

export const contentSchema = z.object({
  id: z.string(),
  type: z.string(),
  language: z.string(),
  description: z.string().optional(),
  title: titleTextSchema,
  theme: titleTextSchema,
  audio_content: z.array(audioTrackSchema),
  is_deleted: z.boolean().optional().default(false),
});

export type Content = z.infer<typeof contentSchema>;

export const contentPageSchema = z.object({
  data: z.array(z.object({ type: z.string() }).passthrough()),
  pagination: z.object({
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export function displayTitle(content: Content): string {
  return content.title.english || content.title.local || 'Untitled';
}

export function primaryAudioUrl(content: Content): string | null {
  return content.audio_content[0]?.audio_url ?? content.title.audio_url ?? content.theme.audio_url ?? null;
}

export function contentDurationSeconds(content: Content): number | null {
  return content.audio_content[0]?.duration_seconds ?? null;
}

export interface GetContentOptions {
  language?: string;
  theme?: string;
  exp_name?: string;
  only_teacher_app?: boolean;
  ids?: string[];
  limit?: number;
  cursor?: string;
}
