import type { TranslationItem } from '../types/localize.types';

type SegmentStage = 'pending' | 'approved' | 'excluded';

export interface Segment {
  id: string;
  key: string;
  route: string;
  sourceText: string;
  translation: string;
  stage: SegmentStage;
  lowConfidence: boolean;
  shared: boolean;
  pattern: string;
}

export function toSegment(item: TranslationItem, lang: string): Segment {
  const entry = item.translations[lang];
  const shared = lang in item.shared;
  const approved = entry?.status === 'approved' || shared;
  const stage = item.exclusion_rule_id !== '' ? 'excluded' : approved ? 'approved' : 'pending';
  return {
    id: item.id,
    key: item.key,
    route: item.route,
    sourceText: item.source_text || item.key,
    translation: shared ? item.shared[lang].translation : (entry?.text ?? ''),
    stage,
    lowConfidence: item.low_confidence,
    shared,
    pattern: item.exclusion_pattern,
  };
}
