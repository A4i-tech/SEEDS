const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/;
// Whole-block markdown image: ![alt](path "optional title"). Groups: 1 alt, 2 path (no spaces or ")"), 3 title.
// Anchored ^...$ so a paragraph that merely contains an image is not classified as an image block.
const IMAGE_RE =/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/;

export function classifyBlock(raw) {
  const trimmed = raw.trim();
  if (/^<!--[\s\S]*-->$/.test(trimmed)) return "marker";
  if (/^\$\$[\s\S]*\$\$$/.test(trimmed)) return "math";
  if (IMAGE_RE.test(trimmed)) return "image";
  if (/^#{1,6}\s/.test(trimmed)) return "heading";
  const lines = trimmed.split("\n");
  if (lines.length >= 2 && /\|/.test(lines[0]) && /^\s*\|?[\s:-]+\|?[\s:-]*\|?\s*$/.test(lines[1])) return "table";
  if (lines.every((line) => LIST_ITEM_RE.test(line))) return "list";
  return "paragraph";
}

export function splitBlocks(pageMarkdown) {
  if (!pageMarkdown) return [];
  return pageMarkdown.split(/\n{2,}/).map((raw, id) => ({ id, raw, type: classifyBlock(raw) }));
}

export function joinBlocks(blocks) {
  return blocks.map((block) => block.raw).join("\n\n");
}

export function parseHeading(raw) {
  const match = raw.trim().match(/^(#{1,6})\s+(.*)$/);
  return match ? { level: match[1].length, text: match[2] } : { level: 1, text: raw.trim() };
}

export function buildHeading({ level, text }) {
  return `${"#".repeat(level)} ${text}`;
}

export function parseList(raw) {
  return raw.split("\n").map((line) => {
    const match = line.match(LIST_ITEM_RE);
    return match ? { prefix: `${match[1]}${match[2]}${match[3]}`, text: match[4] } : { prefix: "", text: line };
  });
}

export function buildList(items) {
  return items.map((item) => `${item.prefix}${item.text}`).join("\n");
}

export function applyListEdit(items, editedText) {
  const lastPrefix = items[items.length - 1]?.prefix || "- ";
  return editedText.split("\n").map((text, i) => ({ prefix: items[i]?.prefix ?? lastPrefix, text }));
}

export function parseImage(raw) {
  const match = raw.trim().match(IMAGE_RE);
  if (!match) return { alt: "", src: "", description: "" };
  return { alt: match[1], src: match[2], description: match[3] || "" };
}

export function buildImage({ alt, src, description }) {
  const title = description ? ` "${description.replace(/"/g, "'")}"` : "";
  return `![${alt}](${src}${title})`;
}

export function replacePageInDocument(fullText, pages, pageIdx, newContent) {
  const page = pages[pageIdx];
  if (!page) return fullText;
  if (page.start === undefined) {
    return pages.map((p, i) => (i === pageIdx ? newContent : p.content)).join("\n\n");
  }
  const original = fullText.slice(page.start, page.end);
  const leadLen = original.length - original.trimStart().length;
  const trailLen = original.length - original.trimEnd().length;
  const lead = original.slice(0, leadLen);
  const trail = trailLen ? original.slice(original.length - trailLen) : "";
  return fullText.slice(0, page.start) + lead + newContent + trail + fullText.slice(page.end);
}
