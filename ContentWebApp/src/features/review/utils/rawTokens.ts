const RAW = /<!--[\s\S]*?-->|<image\b[^>]*\/>|<math\b[\s\S]*?<\/math>|!\[[^\]]*\]\([^)]*\)|\$[^$\n]+\$|[>\\]/g;
const TOKEN = /RAWTOKEN(\d+)END/g;

export function maskRaw(markdown: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = markdown.replace(RAW, (match) => {
    tokens.push(match);
    return `RAWTOKEN${tokens.length - 1}END`;
  });
  return { text, tokens };
}

export function unmaskRaw(text: string, tokens: string[]): string {
  return text.replace(TOKEN, (_, index) => tokens[Number(index)]);
}

export type RawKind = 'page' | 'figure' | 'math' | 'char';

export function describeRaw(raw: string): { kind: RawKind; page: string } {
  const page = /^<!--\s*page\s+(\d+)\s*-->$/i.exec(raw)?.[1];
  if (page) return { kind: 'page', page };
  if (raw.startsWith('![') || raw.startsWith('<image')) return { kind: 'figure', page: '' };
  if (raw.startsWith('$') || raw.startsWith('<math')) return { kind: 'math', page: '' };
  return { kind: 'char', page: '' };
}
