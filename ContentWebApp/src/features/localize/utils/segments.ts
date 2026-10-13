import type { TranslationItem } from '../types/localize.types';

type SegmentStage = 'pending' | 'approved';

export interface Segment {
  id: string;
  key: string;
  route: string;
  sourceText: string;
  translation: string;
  stage: SegmentStage;
  lowConfidence: boolean;
}

export function toSegment(item: TranslationItem, lang: string): Segment {
  const entry = item.translations[lang];
  return {
    id: item.id,
    key: item.key,
    route: item.route,
    sourceText: item.source_text || item.key,
    translation: entry?.text ?? '',
    stage: entry?.status === 'approved' ? 'approved' : 'pending',
    lowConfidence: item.low_confidence,
  };
}
