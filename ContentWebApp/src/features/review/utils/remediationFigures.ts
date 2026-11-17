export interface Figure {
  alt: string;
  description: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const figurePattern = (imageName: string) =>
  new RegExp(`!\\[([^\\]]*)\\]\\(images/${escapeRegExp(imageName)}(?:\\s+"([^"]*)")?\\)`);

export function readFigure(markdown: string, imageName: string): Figure | null {
  const match = figurePattern(imageName).exec(markdown);
  return match ? { alt: match[1], description: match[2] ?? '' } : null;
}

export function writeFigure(markdown: string, imageName: string, { alt, description }: Figure): string {
  const title = description.trim() ? ` "${description.trim().replace(/"/g, "'").replace(/\s*\n\s*/g, ' ')}"` : '';
  return markdown.replace(figurePattern(imageName), () => `![${alt}](images/${imageName}${title})`);
}
