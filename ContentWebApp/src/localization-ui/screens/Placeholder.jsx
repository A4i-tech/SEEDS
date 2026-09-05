import React from "react";

const LABELS = {
  glossary: "Glossary",
  projects: "Projects",
  sites: "Sites",
  languages: "Languages",
  activity: "Activity",
};

export function PlaceholderScreen({ nav }) {
  return (
    <div className="empty">
      <h4>{LABELS[nav] || "Section"} — adopting the new system next</h4>
      <p>
        Configuration lives here, off the daily workflow. This section keeps the current screen
        until the design system is propagated in Phase 3.
      </p>
    </div>
  );
}

export default PlaceholderScreen;
