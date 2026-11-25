import { z } from 'zod';

export const localizedFieldsSchema = z.object({
  title: z.string().trim().min(1, 'validation.required'),
  localTitle: z.string(),
  theme: z.string().trim().min(1, 'validation.required'),
  localTheme: z.string(),
  language: z.string().min(1, 'validation.required'),
});

export type LocalizedValues = z.infer<typeof localizedFieldsSchema>;

export const needsLocal = (language: string) => language.toLowerCase() !== 'en';

export function requireLocal(values: LocalizedValues, ctx: z.core.$RefinementCtx) {
  if (!needsLocal(values.language)) return;
  for (const field of ['localTitle', 'localTheme'] as const) {
    if (!values[field].trim()) ctx.addIssue({ code: 'custom', path: [field], message: 'validation.required' });
  }
}

export function toLocalizedFields({ language, title, localTitle, theme, localTheme }: LocalizedValues) {
  const local = needsLocal(language);
  return {
    language,
    title: { english: title, local: local ? localTitle : title },
    theme: { english: theme, local: local ? localTheme : theme },
  };
}
