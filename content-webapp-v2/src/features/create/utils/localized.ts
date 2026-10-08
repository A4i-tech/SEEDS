import { z } from 'zod';

export const experiences = ['story', 'song', 'poem', 'snippet'] as const;

export const localizedFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Required'),
  localTitle: z.string(),
  theme: z.string().trim().min(1, 'Required'),
  localTheme: z.string(),
  language: z.string().min(1, 'Required'),
});

export type LocalizedValues = z.infer<typeof localizedFieldsSchema>;

export const needsLocal = (language: string) => language.toLowerCase() !== 'en';

export function requireLocal(values: LocalizedValues, ctx: z.core.$RefinementCtx) {
  if (!needsLocal(values.language)) return;
  for (const field of ['localTitle', 'localTheme'] as const) {
    if (!values[field].trim()) ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
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
