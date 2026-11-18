import { PAGE_MARKER } from './remediationPages';

const RAW = /<!--[\s\S]*?-->|<image\b[^>]*\/>|<math\b[\s\S]*?<\/math>|!\[[^\]]*\]\([^)]*\)|\$[^$\n]+\$|\\\||[>\\]/g;
export const TOKEN = /RAWTOKEN(\d+)END/g;
export const TOKEN_AT_START = /^RAWTOKEN(\d+)END/;

export const tokenFor = (index: number) => `RAWTOKEN${index}END`;

export function maskRaw(markdown: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = markdown.replace(RAW, (match) => {
    tokens.push(match);
    return tokenFor(tokens.length - 1);
  });
  return { text, tokens };
}

export function unmaskRaw(text: string, tokens: string[]): string {
  return text.replace(TOKEN, (_, index) => tokens[Number(index)]);
}

export type RawKind = 'page' | 'figure' | 'math' | 'char';

export function describeRaw(raw: string): { kind: RawKind; page: string } {
  const page = PAGE_MARKER.exec(raw)?.[1];
  if (page) return { kind: 'page', page };
  if (raw.startsWith('![') || raw.startsWith('<image')) return { kind: 'figure', page: '' };
  if (raw.startsWith('$') || raw.startsWith('<math')) return { kind: 'math', page: '' };
  return { kind: 'char', page: '' };
}
