import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { flag, list, text } from '@shared/utils/schema';
import { contentItemSchema, contentPageSchema, contentUpdateSchema } from '../types/content.types';
import type { ContentUpdate } from '../types/content.types';

export async function getContentById(id: string) {
  const { data } = await apiClient.get(`/content/${encodeURIComponent(id)}`);
  return contentItemSchema.parse(data);
}

const sasUrlSchema = z.object({ url: z.string() });

export async function getContentSasUrl(audioUrl: string) {
  const { data } = await apiClient.get('/content/sasUrl', { params: { url: audioUrl } });
  return sasUrlSchema.parse(data).url;
}

export const courseSchema = z.object({
  id: z.string(),
  name: z.string(),
  org: text,
  number: text,
  language: text,
  hidden: flag,
  synced: flag,
  lastSyncedAt: text,
  lastRunId: text,
});

export type Course = z.infer<typeof courseSchema>;

const coursesResponseSchema = z.object({
  courses: z.array(courseSchema),
  next_cursor: text,
  has_more: z.boolean().optional(),
});

const jobIdSchema = z.object({ jobId: z.string() });

export async function getContentPage(cursor?: string, limit = 20) {
  const { data } = await apiClient.get('/content', {
    params: { ...(cursor && { cursor }), limit },
  });
  return contentPageSchema.parse(data);
}

export async function deleteContent(id: string) {
  await apiClient.delete(`/content/${encodeURIComponent(id)}`);
}

export async function updateContent(id: string, patch: ContentUpdate, isAudioUploaded: boolean) {
  const body = contentUpdateSchema.parse({ ...patch, id });
  const { data } = await apiClient.patch(`/content/${encodeURIComponent(id)}`, body, {
    params: { is_audio_uploaded: isAudioUploaded },
  });
  return contentItemSchema.parse(data);
}

export async function getCourses(cursor?: string, limit = 20) {
  const { data } = await apiClient.get('/content-aggregators/courses', {
    params: { ...(cursor && { cursor }), limit },
  });
  return coursesResponseSchema.parse(data);
}

export async function deleteCourse(courseId: string) {
  await apiClient.delete(`/content-aggregators/courses/${encodeURIComponent(courseId)}`);
}

const courseChoiceSchema = z.object({ value: z.string(), text: z.string() });

const courseBlockSchema = z.object({
  block_id: z.string(),
  type: z.string(),
  display_name: text,
  markdown: text,
  html: text,
  question: text,
  choices: list(courseChoiceSchema),
  student_view_data: z
    .object({
      sources: list(z.string()),
      streams: text,
      poster: text,
    })
    .nullish()
    .transform((value) => value ?? { sources: [], streams: '', poster: '' }),
});

export type CourseBlock = z.infer<typeof courseBlockSchema>;

export const courseDetailSchema = z.object({
  title: text,
  name: text,
  description: text,
  hidden: flag,
  blocks: list(courseBlockSchema),
});

export type CourseDetail = z.infer<typeof courseDetailSchema>;

export async function getCourse(courseId: string) {
  const { data } = await apiClient.get(`/content-aggregators/courses/${encodeURIComponent(courseId)}`);
  return courseDetailSchema.parse(data);
}

const modifiedSchema = z.object({ modified: z.number() });

export async function updateProblemBlock(
  courseId: string,
  blockId: string,
  payload: { question: string; choices: { value: string; text: string }[] },
) {
  const { data } = await apiClient.patch(
    `/content-aggregators/courses/${encodeURIComponent(courseId)}/blocks/${encodeURIComponent(blockId)}`,
    payload,
  );
  return modifiedSchema.parse(data);
}

export async function syncAllCourses() {
  const { data } = await apiClient.post('/content-aggregators/sync', { onlyNew: true });
  return jobIdSchema.parse(data);
}

export async function syncCourse(courseId: string) {
  const { data } = await apiClient.post(
    `/content-aggregators/sync/course/${encodeURIComponent(courseId)}`,
    {},
  );
  return jobIdSchema.parse(data);
}

const ivrUpdateSchema = z.object({ message: text });

export async function updateIvr() {
  const { data } = await apiClient.patch('/ivr');
  return ivrUpdateSchema.parse(data);
}
