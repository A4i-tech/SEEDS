export interface Figure {
  alt: string;
  description: string;
}

export type Segment =
  | { type: 'text'; markdown: string }
  | { type: 'figure'; imageName: string; figure: Figure };

const FIGURE_BLOCK = /^!\[([^\]]*)\]\(images\/([^)\s"]+)(?:\s+"([^"]*)")?\)$/;

export function figureMarkdown(imageName: string, { alt, description }: Figure): string {
  const title = description.trim() ? ` "${description.trim().replace(/"/g, "'").replace(/\s*\n\s*/g, ' ')}"` : '';
  return `![${alt}](images/${imageName}${title})`;
}

export function splitSegments(page: string): Segment[] {
  const segments: Segment[] = [];
  let text: string[] = [];
  const flush = () => {
    if (text.length > 0) segments.push({ type: 'text', markdown: text.join('\n\n') });
    text = [];
  };
  for (const block of page.split(/\n{2,}/)) {
    const match = FIGURE_BLOCK.exec(block.trim());
    if (match) {
      flush();
      segments.push({ type: 'figure', imageName: match[2], figure: { alt: match[1], description: match[3] ?? '' } });
    } else {
      text.push(block);
    }
  }
  flush();
  return segments;
}

export function joinSegments(segments: Segment[]): string {
  return segments
    .map((segment) => (segment.type === 'text' ? segment.markdown : figureMarkdown(segment.imageName, segment.figure)))
    .join('\n\n');
}
