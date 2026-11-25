import { describe, expect, it } from 'vitest';
import { toSegment } from '@features/localize/utils/segments';
import type { TranslationItem } from '@features/localize/types/localize.types';

const item = (overrides: Partial<TranslationItem>): TranslationItem => ({
  id: 'k1',
  key: 'k',
  route: '/a',
  source_text: 'Hello',
  low_confidence: false,
  translations: {},
  ...overrides,
});

describe('toSegment', () => {
  it('maps id, source, translation and stage', () => {
    const doc = item({ translations: { hi: { text: 'namaste', status: 'approved' } } });
    expect(toSegment(doc, 'hi')).toEqual({
      id: 'k1',
      key: 'k',
      route: '/a',
      sourceText: 'Hello',
      translation: 'namaste',
      stage: 'approved',
      lowConfidence: false,
    });
  });

  it('uses an empty translation when the language has no draft', () => {
    expect(toSegment(item({ id: 'k2', source_text: 'Bye' }), 'hi')).toMatchObject({
      id: 'k2',
      sourceText: 'Bye',
      translation: '',
      stage: 'pending',
    });
  });

  it('a draft that is not approved stays pending', () => {
    expect(toSegment(item({ translations: { hi: { text: 'x', status: 'pending' } } }), 'hi').stage).toBe('pending');
    expect(toSegment(item({ translations: { hi: { text: 'x', status: 'rejected' } } }), 'hi').stage).toBe('pending');
  });

  it('ignores entries for other languages', () => {
    expect(toSegment(item({ translations: { kn: { text: 'x', status: 'approved' } } }), 'hi')).toMatchObject({
      translation: '',
      stage: 'pending',
    });
  });

  it('falls back to the key when there is no source text', () => {
    expect(toSegment(item({ source_text: '' }), 'hi').sourceText).toBe('k');
  });
});
