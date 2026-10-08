import { z } from 'zod';
import { text } from '@shared/utils/schema';

const titleTextSchema = z.object({
  english: z.string().nullable().optional(),
  local: z.string().nullable().optional(),
  audio_url: z.string().nullable().optional(),
});

const audioTrackSchema = z.object({
  audio_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
});

const EMPTY_TITLE_TEXT = { english: '', local: '', audio_url: '' };

const titleTextResponseSchema = z
  .object({ english: text, local: text, audio_url: text })
  .default(EMPTY_TITLE_TEXT);

const audioTrackResponseSchema = z.object({
  audio_url: text,
  description: text,
  duration_seconds: z.number().nullish().transform((value) => value ?? 0),
});

const contentBaseResponseSchema = z.object({
  id: z.string(),
  language: z.string(),
  title: titleTextResponseSchema,
  theme: titleTextResponseSchema,
  is_pull_model: z.boolean().default(false),
  is_teacher_app: z.boolean().default(false),
  is_deleted: z.boolean().default(false),
  description: text,
  created_by: text,
  tenant_id: text,
  school_id: text,
  creation_time: z.number().nullish().transform((value) => value ?? 0),
});

const audioContentSchema = contentBaseResponseSchema.extend({
  type: z.enum(['story', 'song', 'poem', 'snippet']),
  audio_content: z.array(audioTrackResponseSchema).default([]),
  is_processed: z.boolean().default(false),
  primary_audio_url: text,
  version: text,
  job_id: text,
});

const quizOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  url: z.string().nullable().optional(),
});

const quizQuestionSchema = z.object({
  question: z.object({
    id: z.string(),
    text: z.string(),
    url: z.string().nullable().optional(),
  }),
  options: z.array(quizOptionSchema).optional(),
  correct_option_id: z.string(),
});

const quizQuestionResponseSchema = z.object({
  question: z.object({ id: z.string(), text: z.string(), url: text }),
  options: z.array(z.object({ id: z.string(), text: z.string(), url: text })).default([]),
  correct_option_id: z.string(),
});

export const quizContentSchema = contentBaseResponseSchema.extend({
  type: z.literal('quiz'),
  positive_marks: z.number().optional(),
  negative_marks: z.number().optional(),
  questions: z.array(quizQuestionResponseSchema).default([]),
});

export const contentItemSchema = z.discriminatedUnion('type', [audioContentSchema, quizContentSchema]);
export type ContentItem = z.infer<typeof contentItemSchema>;
export type AudioContentItem = Exclude<ContentItem, { type: 'quiz' }>;

export const quizCreateSchema = z.object({
  type: z.string(),
  language: z.string(),
  title: titleTextSchema.optional(),
  theme: titleTextSchema.optional(),
  description: z.string().optional(),
  is_pull_model: z.boolean().optional(),
  is_teacher_app: z.boolean().optional(),
  positive_marks: z.number().optional(),
  negative_marks: z.number().optional(),
  questions: z.array(quizQuestionSchema).optional(),
});

export type QuizCreate = z.infer<typeof quizCreateSchema>;

export const contentCreateSchema = z.object({
  type: z.string(),
  language: z.string(),
  title: titleTextSchema.optional(),
  theme: titleTextSchema.optional(),
  description: z.string().optional(),
  audio_content: z.array(audioTrackSchema).optional(),
  is_pull_model: z.boolean().optional(),
  is_teacher_app: z.boolean().optional(),
});

export type ContentCreate = z.infer<typeof contentCreateSchema>;

export const contentUpdateSchema = z.object({
  id: z.string(),
  title: titleTextSchema.optional(),
  theme: titleTextSchema.optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  language: z.string().optional(),
  audio_content: z.array(audioTrackSchema).optional(),
  is_pull_model: z.boolean().optional(),
  is_teacher_app: z.boolean().optional(),
});

export type ContentUpdate = z.infer<typeof contentUpdateSchema>;

export const contentPageSchema = z.object({
  data: z.array(contentItemSchema),
  pagination: z.object({
    next_cursor: text,
    has_more: z.boolean().optional(),
    limit: z.number(),
  }),
});

export const libraryKeys = {
  all: ['library'] as const,
  content: ['library', 'content'] as const,
  contentDetail: (id: string) => ['library', 'content', id] as const,
  contentAudio: (id: string) => ['library', 'content', id, 'audio'] as const,
  courses: ['library', 'courses'] as const,
  courseDetail: (id: string) => ['library', 'course', id] as const,
};

export const CONTENT_UI: Record<ContentItem['type'], { preview: 'audio' | 'quiz'; hasDescription: boolean; hasAudioUpload: boolean }> = {
  story: { preview: 'audio', hasDescription: true, hasAudioUpload: true },
  song: { preview: 'audio', hasDescription: true, hasAudioUpload: true },
  poem: { preview: 'audio', hasDescription: true, hasAudioUpload: true },
  snippet: { preview: 'audio', hasDescription: true, hasAudioUpload: true },
  quiz: { preview: 'quiz', hasDescription: false, hasAudioUpload: false },
};


