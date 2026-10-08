import type { CourseBlock } from '../api/library';

export function blockLabel(block: CourseBlock): string {
  return block.display_name || block.type;
}

export function disambiguateLabels(blocks: CourseBlock[]): string[] {
  const labels = blocks.map(blockLabel);
  return labels.map((label, i) => {
    if (labels.filter((l) => l === label).length <= 1) return label;
    return `${label} ${labels.slice(0, i + 1).filter((l) => l === label).length}`;
  });
}
