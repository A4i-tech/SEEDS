import React from "react";

const BACKTICK_MATH_RE = /\$`([^`]+)`\$/g;

export function normalizeMathDelimiters(markdown) {
  return markdown.replace(BACKTICK_MATH_RE, (match, latex) => `$${latex}$`);
}

export function MarkdownParagraph({ children, ...props }) {
  const firstChild = React.Children.toArray(children)[0];
  const isNestedBullet = typeof firstChild === "string" && firstChild.trimStart().startsWith("■");
  return (
    <p {...props} className={isNestedBullet ? "content-aggregator-nested-bullet" : undefined}>
      {children}
    </p>
  );
}
