import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodValidate } from '@shared/utils/schema';

describe('zodValidate', () => {
  it('returns an empty object for valid values', () => {
    expect(zodValidate(z.object({ a: z.string() }))({ a: 'x' })).toEqual({});
  });

  it('translates message keys', () => {
    const schema = z.object({ a: z.string().min(1, 'validation.required') });
    expect(zodValidate(schema)({ a: '' })).toEqual({ a: 'Required' });
  });

  it('translates refine messages by path', () => {
    const schema = z.object({ a: z.string() }).refine(() => false, { message: 'validation.invalid', path: ['a'] });
    expect(zodValidate(schema)({ a: 'x' })).toEqual({ a: 'Invalid' });
  });
});
