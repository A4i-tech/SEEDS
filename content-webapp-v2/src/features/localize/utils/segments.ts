import type { TranslationItem } from '../types/localize.types';

export type SegmentStage = 'pending' | 'approved';

export interface Segment {
  id: string;
  key: string;
  route: string;
  sourceText: string;
  translation: string;
  stage: SegmentStage;
  lowConfidence: boolean;
}

interface TranslationEntry {
  text?: unknown;
  status?: unknown;
}

function entryOf(item: TranslationItem, lang: string): TranslationEntry {
  const value = item.translations?.[lang];
  return value !== null && typeof value === 'object' ? (value as TranslationEntry) : {};
}

export function toSegment(item: TranslationItem, lang: string): Segment {
  const raw = item as unknown as Record<string, unknown>;
  const entry = entryOf(item, lang);
  const source = raw['source_text'];
  return {
    id: item.id,
    key: item.key ?? '',
    route: item.route ?? '',
    sourceText: typeof source === 'string' && source !== '' ? source : (item.key ?? ''),
    translation: typeof entry.text === 'string' ? entry.text : '',
    stage: entry.status === 'approved' ? 'approved' : 'pending',
    lowConfidence: item.low_confidence ?? false,
  };
}
