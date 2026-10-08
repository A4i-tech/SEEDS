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

const EMPTY_ENTRY = { text: '', status: '' };

function stageOf(status: string): SegmentStage {
  if (status === 'approved') return 'approved';
  return 'pending';
}

export function toSegment(item: TranslationItem, lang: string): Segment {
  const entry = item.translations[lang] ?? EMPTY_ENTRY;
  return {
    id: item.id,
    key: item.key,
    route: item.route,
    sourceText: item.source_text || item.key,
    translation: entry.text,
    stage: stageOf(entry.status),
    lowConfidence: item.low_confidence,
  };
}
