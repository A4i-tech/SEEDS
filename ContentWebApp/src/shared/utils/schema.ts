import { z } from 'zod';

export const text = z.string().nullish().transform((value) => value ?? '');

export const flag = z.boolean().nullish().transform((value) => value ?? false);

export const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

export const count = z.number().nullish().transform((value) => value ?? 0);
