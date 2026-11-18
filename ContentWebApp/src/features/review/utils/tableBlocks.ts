export interface TableData {
  header: string[];
  rows: string[][];
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());

const isSeparator = (line: string) => /^\s*\|?[\s:|-]*-[\s:|-]*$/.test(line);

export function parseTable(markdown: string): TableData | null {
  const [headerLine, separatorLine, ...rowLines] = markdown.split('\n');
  if (!separatorLine || !isSeparator(separatorLine) || !headerLine.includes('|')) return null;
  const header = cells(headerLine);
  const rows = rowLines.map(cells);
  if (header.length < 2 || rows.some((row) => row.length !== header.length)) return null;
  return { header, rows };
}

const line = (row: string[]) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;

export function buildTable({ header, rows }: TableData): string {
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}
