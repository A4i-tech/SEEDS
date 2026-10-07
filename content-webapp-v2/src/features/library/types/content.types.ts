import { z } from 'zod';

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

const audioContentSchema = z.object({
  id: z.string(),
  type: z.enum(['story', 'song', 'poem', 'snippet']),
  language: z.string(),
  title: titleTextSchema.optional(),
  theme: titleTextSchema.optional(),
  is_pull_model: z.boolean().optional(),
  is_teacher_app: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_by: z.string().nullable().optional(),
  tenant_id: z.string().nullable().optional(),
  school_id: z.string().nullable().optional(),
  creation_time: z.number().nullable().optional(),
  audio_content: z.array(audioTrackSchema).optional(),
  description: z.string().nullable().optional(),
  is_processed: z.boolean().optional(),
  primary_audio_url: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  job_id: z.string().nullable().optional(),
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

export const quizContentSchema = z.object({
  id: z.string(),
  type: z.literal('quiz'),
  language: z.string(),
  title: titleTextSchema.optional(),
  theme: titleTextSchema.optional(),
  is_pull_model: z.boolean().optional(),
  is_teacher_app: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_by: z.string().nullable().optional(),
  tenant_id: z.string().nullable().optional(),
  school_id: z.string().nullable().optional(),
  creation_time: z.number().nullable().optional(),
  positive_marks: z.number().optional(),
  negative_marks: z.number().optional(),
  questions: z.array(quizQuestionSchema).optional(),
});

export const contentItemSchema = z.discriminatedUnion('type', [audioContentSchema, quizContentSchema]);
export type ContentItem = z.infer<typeof contentItemSchema>;

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
    next_cursor: z.string().nullable().optional(),
    has_more: z.boolean().optional(),
    limit: z.number(),
  }),
});

export type ContentPage = z.infer<typeof contentPageSchema>;
