// edX's default display name is generic per type ("Multiple Choice" for every
// problem, "Video" for every video) — with many blocks sharing that generic
// name, disambiguate repeats as "Multiple Choice 1", "Multiple Choice 2", etc.
// Names the course author actually customized (appearing only once) are left as-is.
export function disambiguateLabels(blocks) {
  const totals = {};
  blocks.forEach((b) => {
    const label = b.display_name || b.type;
    totals[label] = (totals[label] || 0) + 1;
  });
  const running = {};
  return blocks.map((b) => {
    const label = b.display_name || b.type;
    if (totals[label] <= 1) return label;
    running[label] = (running[label] || 0) + 1;
    return `${label} ${running[label]}`;
  });
}
