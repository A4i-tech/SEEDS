import React from "react";
import { cn } from "../lib/cn";

export function Badge({ tone = "neutral", children, className }) {
  return <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>;
}

const LIFECYCLE = {
  new: { tone: "neutral", label: "New" },
  translated: { tone: "info", label: "Translated" },
  needs_review: { tone: "info", label: "Needs review" },
  edited: { tone: "accent", label: "Edited" },
  approved: { tone: "good", label: "Approved" },
  published: { tone: "good", label: "Published" },
  rejected: { tone: "crit", label: "Rejected" },
};

export function StatusBadge({ stage }) {
  const s = LIFECYCLE[stage] || LIFECYCLE.new;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ConfidenceBadge({ score, threshold = 0.7 }) {
  if (score == null)
    return (
      <span className="mono" style={{ color: "var(--muted)" }}>
        —
      </span>
    );
  const low = score < threshold;
  return (
    <Badge tone={low ? "warn" : "good"}>
      {low ? "Low confidence" : "Good"} · {(score * 100).toFixed(0)}%
    </Badge>
  );
}

export function QualityBar({ score }) {
  if (score == null)
    return (
      <span className="mono" style={{ color: "var(--muted)" }}>
        —
      </span>
    );
  const pct = Math.round(score * 100);
  const cls = score < 0.5 ? "crit" : score < 0.7 ? "low" : "";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className={cn("qbar", cls)}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="mono" style={{ fontSize: "var(--fs-12)" }}>
        {score.toFixed(2)}
      </span>
    </span>
  );
}

export default Badge;
