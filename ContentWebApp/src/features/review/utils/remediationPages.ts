export interface RemediationPage {
  pageNum: number;
  content: string;
}

const PAGE_MARKER = /<!--\s*page\s+(\d+)\s*-->/gi;
const CHUNK_SIZE = 3500;

export function splitIntoPages(markdown: string): RemediationPage[] {
  if (!markdown) return [];
  const matches = [...markdown.matchAll(PAGE_MARKER)];

  if (matches.length === 0) {
    const chunks: RemediationPage[] = [];
    let current = '';
    for (const paragraph of markdown.split(/\n\n+/)) {
      if (current.length + paragraph.length > CHUNK_SIZE && current.length > 0) {
        chunks.push({ pageNum: chunks.length + 1, content: current.trim() });
        current = paragraph;
      } else {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      }
    }
    if (current.trim()) chunks.push({ pageNum: chunks.length + 1, content: current.trim() });
    return chunks;
  }

  return matches.map((match, i) => ({
    pageNum: parseInt(match[1], 10),
    content: markdown.slice(match.index, i + 1 < matches.length ? matches[i + 1].index : markdown.length).trim(),
  }));
}

export function pageContent(pages: RemediationPage[], index: number): string {
  return pages[index]?.content ?? '';
}

export function toPlainText(markdown: string): string {
  const doc = new DOMParser().parseFromString(markdown, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  return doc.body.textContent;
}
