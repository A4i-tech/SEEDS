import React from "react";
import { Wrench } from "lucide-react";
import { EmptyState } from "../primitives";

const LABELS = {
  glossary: "Glossary", projects: "Projects", sites: "Sites",
  languages: "Languages", activity: "Activity",
};

/**
 * Configuration sections are intentionally off the daily path (§2). In the
 * prototype they show a stub; on rollout they adopt the same design system.
 */
export function PlaceholderScreen({ nav }) {
  return (
    <EmptyState
      icon={Wrench}
      title={`${LABELS[nav] || "Section"} — adopting the new system next`}
      message="Configuration lives here, off the daily workflow. This section keeps the current screen until the design system is propagated in Phase 3."
    />
  );
}

export default PlaceholderScreen;
