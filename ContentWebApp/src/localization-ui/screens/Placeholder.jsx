import React from "react";
import { EmptyState } from "../primitives";

const LABELS = {
  glossary: "Glossary",
  projects: "Projects",
  sites: "Sites",
  languages: "Languages",
  activity: "Activity",
};

export function PlaceholderScreen({ nav }) {
  return (
    <EmptyState
      title={`${LABELS[nav] || "Section"} — adopting the new system next`}
      message="Configuration lives here, off the daily workflow. This section keeps the current screen until the design system is propagated in Phase 3."
    />
  );
}

export default PlaceholderScreen;
