import { z } from 'zod';

export const text = z.string().nullish().transform((value) => value ?? '');

export const flag = z.boolean().nullish().transform((value) => value ?? false);

export const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

export const count = z.number().nullish().transform((value) => value ?? 0);

export function zodValidate<Schema extends z.ZodType>(schema: Schema) {
  return (values: unknown) => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
  };
}
