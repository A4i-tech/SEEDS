export interface Figure {
  alt: string;
  description: string;
}

export type Segment =
  | { type: 'text'; markdown: string }
  | { type: 'raw'; markdown: string }
  | { type: 'figure'; imageName: string; figure: Figure };

// Matches a block that is only one figure, ![alt](images/name "description"), so images inside a paragraph stay text.
const FIGURE_BLOCK =/^!\[([^\]]*)\]\(images\/([^)\s"]+)(?:\s+"([^"]*)")?\)$/;

// A pipe table (header row, then a dashes row) or $$ display math: edited as plain text so the editor cannot reflow it.
const DISPLAY_MATH = /^\$\$[\s\S]*\$\$$/;
const TABLE = /^[^\n]*\|[^\n]*\n[\s:|-]*-[\s:|-]*(\n|$)/;
const isRawBlock = (block: string) => DISPLAY_MATH.test(block) || TABLE.test(block);

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
    } else if (isRawBlock(block.trim())) {
      flush();
      segments.push({ type: 'raw', markdown: block });
    } else {
      text.push(block);
    }
  }
  flush();
  return segments;
}

export function joinSegments(segments: Segment[]): string {
  return segments
    .map((segment) => (segment.type === 'figure' ? figureMarkdown(segment.imageName, segment.figure) : segment.markdown))
    .join('\n\n');
}
