import type { TranslationItem } from '../types/localize.types';

type SegmentStage = 'pending' | 'approved' | 'excluded' | 'overridden';

export interface Segment {
  id: string;
  key: string;
  route: string;
  sourceText: string;
  translation: string;
  stage: SegmentStage;
  lowConfidence: boolean;
  pattern: string;
}

export function toSegment(item: TranslationItem, lang: string): Segment {
  const entry = item.translations[lang];
  const shared = lang in item.shared;
  let stage: SegmentStage = entry?.status === 'approved' ? 'approved' : 'pending';
  let translation = entry?.text ?? '';
  if (shared) {
    stage = 'overridden';
    translation = item.shared[lang].translation;
  }
  if (item.exclusion_rule_id !== '') {
    stage = 'excluded';
    translation = item.source_text;
  }
  return {
    id: item.id,
    key: item.key,
    route: item.route,
    sourceText: item.source_text || item.key,
    translation,
    stage,
    lowConfidence: item.low_confidence,
    pattern: item.exclusion_pattern,
  };
}
