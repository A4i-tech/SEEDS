import { z } from 'zod';

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
  domain: z.string().nullish(),
  name: z.string().nullish(),
  status: z.string().nullish(),
  languages: z.array(languageConfigSchema).nullable().optional(),
  site_id: z.string().nullish(),
  api_base: z.string().nullish(),
  project_id: z.string().nullish(),
  created_at: z.unknown(),
  updated_at: z.unknown(),
});

export type Website = z.infer<typeof websiteSchema>;

export const translationItemSchema = z.object({
  id: z.string(),
  translations: z.record(z.string(), z.unknown()).nullable().optional(),
  low_confidence: z.boolean().optional(),
  site_id: z.string().nullish(),
  route: z.string().nullish(),
  key: z.string().nullish(),
  lang: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
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
