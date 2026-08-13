import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// edX renders formulas as literal `[mathjax]...[/mathjax]` / `[mathjaxinline]...[/mathjaxinline]`
// markers (its own MathJax shorthand) — KaTeX understands the same LaTeX inside them.
const MATHJAX_RE = /\[mathjax(inline)?\]([\s\S]*?)\[\/mathjax(?:inline)?\]/g;

function renderMathHtml(text) {
  if (!text) return "";
  let html = "";
  let lastIndex = 0;
  let match;
  MATHJAX_RE.lastIndex = 0;
  while ((match = MATHJAX_RE.exec(text))) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const isInline = Boolean(match[1]);
    try {
      html += katex.renderToString(match[2], { throwOnError: false, displayMode: !isInline });
    } catch {
      html += escapeHtml(match[0]);
    }
    lastIndex = MATHJAX_RE.lastIndex;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

export function MathText({ text, as: Tag = "span" }) {
  const html = useMemo(() => renderMathHtml(text), [text]);
  return <Tag dangerouslySetInnerHTML={{ __html: html }} />;
}
