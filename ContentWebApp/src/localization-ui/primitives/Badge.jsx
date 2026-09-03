import React from "react";
import { Circle, Sparkles, Eye, Pencil, CheckCircle2, Rocket, AlertTriangle } from "lucide-react";
import { cn } from "../lib/cn";

export function Badge({ tone = "neutral", icon: Icon, children, className }) {
  return (
    <span className={cn("badge", `badge-${tone}`, className)}>
      {Icon ? <Icon /> : null}
      {children}
    </span>
  );
}

const LIFECYCLE = {
  new: { tone: "neutral", icon: Circle, label: "New" },
  translated: { tone: "info", icon: Sparkles, label: "Translated" },
  needs_review: { tone: "info", icon: Eye, label: "Needs review" },
  edited: { tone: "accent", icon: Pencil, label: "Edited" },
  approved: { tone: "good", icon: CheckCircle2, label: "Approved" },
  published: { tone: "good", icon: Rocket, label: "Published" },
  rejected: { tone: "crit", icon: AlertTriangle, label: "Rejected" },
};

export function StatusBadge({ stage }) {
  const s = LIFECYCLE[stage] || LIFECYCLE.new;
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
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
    <Badge tone={low ? "warn" : "good"} icon={low ? AlertTriangle : CheckCircle2}>
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
