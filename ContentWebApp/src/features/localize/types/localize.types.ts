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

const sharedMatchSchema = z.object({ rule_id: z.string(), translation: z.string() });

export const translationItemSchema = z.object({
  id: z.string(),
  translations: z
    .partialRecord(z.string(), translationEntrySchema)
    .nullish()
    .transform((value) => value ?? {}),
  low_confidence: z.boolean().default(false),
  exclusion_rule_id: z.string().default(''),
  exclusion_pattern: z.string().default(''),
  shared: z.record(z.string(), sharedMatchSchema).default({}),
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

export const ruleKindSchema = z.enum(['exclusion', 'override']);

export type RuleKind = z.infer<typeof ruleKindSchema>;

export const ruleSchema = z.object({
  id: z.string(),
  kind: ruleKindSchema,
  text: z.string(),
  lang: z.string(),
  translation: z.string(),
  updated_at: z.string(),
  updated_by: z.string(),
});

export type Rule = z.infer<typeof ruleSchema>;

export type RuleFields = Pick<Rule, 'kind' | 'text' | 'lang' | 'translation'>;

export const localizeKeys = {
  all: ['localize'] as const,
  sites: ['localize', 'sites'] as const,
  reviews: ['localize', 'review'] as const,
  review: (siteId: string, route: string) => ['localize', 'review', siteId, route] as const,
  pages: (siteId: string) => ['localize', 'pages', siteId] as const,
  rules: (siteId: string) => ['localize', 'rules', siteId] as const,
};
