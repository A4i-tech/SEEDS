import { z } from 'zod';
import { list, text } from '@shared/utils/schema';

export const reviewScopeSchema = z.object({ siteId: text, route: text, lang: text });
export type ReviewScope = z.infer<typeof reviewScopeSchema>;

const languageConfigSchema = z.object({
  code: z.string(),
  enabled: z.boolean().default(true),
});

export const websiteSchema = z.object({
  id: z.string(),
  domain: text,
  name: text,
  status: text,
  languages: list(languageConfigSchema),
  site_id: text,
  api_base: text,
  updated_at: text,
});

export type Website = z.infer<typeof websiteSchema>;

export type WebsiteFields = Pick<Website, 'domain' | 'name' | 'status' | 'languages'>;

const translationEntrySchema = z.object({ text, status: text });

export const translationItemSchema = z.object({
  id: z.string(),
  translations: z
    .partialRecord(z.string(), translationEntrySchema)
    .nullish()
    .transform((value) => value ?? {}),
  low_confidence: z.boolean().default(false),
  source_text: text,
  route: text,
  key: text,
  updated_at: text,
});

export type TranslationItem = z.infer<typeof translationItemSchema>;

export const bulkApproveResultSchema = z.object({
  approved: z.number(),
  skipped: z.number().default(0),
  failed: z.number().default(0),
});

export type BulkApproveResult = z.infer<typeof bulkApproveResultSchema>;

export const localizeKeys = {
  all: ['localize'] as const,
  sites: ['localize', 'sites'] as const,
  reviews: ['localize', 'review'] as const,
  review: (siteId: string, route: string) => ['localize', 'review', siteId, route] as const,
  pages: (siteId: string) => ['localize', 'pages', siteId] as const,
};
