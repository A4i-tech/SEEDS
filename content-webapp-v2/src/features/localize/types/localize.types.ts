import { z } from 'zod';
import { list, text } from '@shared/utils/schema';

export const languageConfigSchema = z.object({
  code: z.string(),
  enabled: z.boolean().default(true),
});

export const websiteCreateSchema = z.object({
  project_id: z.string().nullable().optional(),
  domain: z.string(),
  name: z.string().default(''),
  status: z.string().default('Active'),
  languages: z.array(languageConfigSchema).nullable().optional(),
});

export type WebsiteCreate = z.infer<typeof websiteCreateSchema>;

export const websiteUpdateSchema = z.object({
  name: z.string().optional(),
  domain: z.string().optional(),
  status: z.string().optional(),
  languages: z.array(languageConfigSchema).nullable().optional(),
});

export type WebsiteUpdate = z.infer<typeof websiteUpdateSchema>;

export const websiteSchema = z.object({
  id: z.string(),
  domain: text,
  name: text,
  status: text,
  languages: list(languageConfigSchema),
  site_id: text,
  api_base: text,
  project_id: text,
  created_at: z.unknown(),
  updated_at: text,
});

export type Website = z.infer<typeof websiteSchema>;

const translationEntrySchema = z.object({ text, status: text });

export const translationItemSchema = z.object({
  id: z.string(),
  translations: z
    .partialRecord(z.string(), translationEntrySchema)
    .nullish()
    .transform((value) => value ?? {}),
  low_confidence: z.boolean().default(false),
  source_text: text,
  site_id: text,
  route: text,
  key: text,
  lang: text,
  created_at: text,
  updated_at: text,
});

export type TranslationItem = z.infer<typeof translationItemSchema>;

export const translationUpdateSchema = z.object({
  lang: z.string(),
  text: z.string(),
});

export type TranslationUpdate = z.infer<typeof translationUpdateSchema>;

export const translationApproveSchema = z.object({
  lang: z.string(),
});

export type TranslationApprove = z.infer<typeof translationApproveSchema>;

export const bulkApproveSchema = z.object({
  route: z.string().optional(),
  lang: z.string().optional(),
});

export type BulkApprove = z.infer<typeof bulkApproveSchema>;

export const extractItemSchema = z.object({
  key: z.string(),
  text: z.string().max(5000),
  route: z.string().max(2048),
  source_lang: z.string().default('en'),
});

export type ExtractItem = z.infer<typeof extractItemSchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  site_id: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
  key: z.string().nullable().optional(),
  lang: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  actor: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  at: z.unknown().optional(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const translationVersionSchema = z.object({
  id: z.string(),
  translation_id: z.string().nullable().optional(),
  version: z.number().nullable().optional(),
  translations: z.record(z.string(), z.unknown()).nullable().optional(),
  approved_by: z.string().nullable().optional(),
  approved_at: z.unknown().optional(),
  created_at: z.unknown().optional(),
});

export type TranslationVersion = z.infer<typeof translationVersionSchema>;

export const bulkApproveResultSchema = z.object({
  approved: z.number(),
  skipped: z.number(),
  failed: z.number(),
});

export type BulkApproveResult = z.infer<typeof bulkApproveResultSchema>;
