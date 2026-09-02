const LOW_CONF_THRESHOLD = 0.7;

export function deriveStage(doc, lang, { edited = false } = {}) {
  const t = doc?.translations?.[lang];
  if (t?.status === "rejected") return "rejected";
  if (t?.status === "approved") return "approved";
  if (!t || !t.text) return "new";
  if (edited) return "edited";
  return "needs_review";
}

export function toSegment(doc, lang) {
  const id = doc.id || doc._id;
  const t = doc?.translations?.[lang] || null;
  const score = t && typeof t.qualityScore === "number" ? t.qualityScore : null;
  const lowConfidence =
    typeof t?.lowConfidence === "boolean"
      ? t.lowConfidence
      : typeof score === "number"
      ? score < LOW_CONF_THRESHOLD
      : false;
  return {
    id,
    key: doc.key,
    route: doc.route,
    sourceText: doc.sourceText || "",
    translation: t?.text || "",
    hasTranslation: Boolean(t?.text),
    qualityScore: score,
    lowConfidence,
    provider: t?.provider || null,
    status: t?.status || "",
    version: doc.version || 0,
    stage: deriveStage(doc, lang),
    raw: doc,
  };
}

export function summarize(segments) {
  const total = segments.length;
  const approved = segments.filter((s) => s.stage === "approved").length;
  const low = segments.filter((s) => s.lowConfidence && s.hasTranslation).length;
  const untranslated = segments.filter((s) => !s.hasTranslation).length;
  const pct = total ? Math.round((approved / total) * 100) : 0;
  return { total, approved, low, untranslated, pct };
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

export { LOW_CONF_THRESHOLD };
