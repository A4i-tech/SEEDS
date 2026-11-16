import { z } from 'zod';

const isSafePath = (redirect: string) =>
  redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('\\');

export const redirectSearchSchema = z
  .object({ redirect: z.string().default('/home') })
  .transform(({ redirect }) => ({ redirect: isSafePath(redirect) ? redirect : '/home' }));
