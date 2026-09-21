export function deriveStage(doc, lang) {
  const t = doc.translations?.[lang];
  if (t?.status === "rejected") return "rejected";
  if (t?.status === "approved") return "approved";
  if (!t || !t.text) return "new";
  return "needs_review";
}

export function toSegment(doc, lang) {
  return {
    id: doc.id,
    sourceText: doc.sourceText,
    translation: doc.translations?.[lang]?.text || "",
    stage: deriveStage(doc, lang),
  };
}

export function pagesFromDocs(docs, lang) {
  const map = new Map();
  for (const d of docs) {
    const r = d.route || "/";
    const e = map.get(r) || { route: r, total: 0, approved: 0, updatedAt: null };
    e.total += 1;
    if (d.translations?.[lang]?.status === "approved") e.approved += 1;
    const u = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
    if (!e.updatedAt || u > e.updatedAt) e.updatedAt = u;
    map.set(r, e);
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
