import React from "react";
import "../../components/AllContent/shared/utilities.css";

const LABELS = {
  glossary: "Glossary",
  projects: "Projects",
  sites: "Sites",
  languages: "Languages",
  activity: "Activity",
};

export function PlaceholderScreen({ nav }) {
  return (
    <div className="no-content">
      {LABELS[nav] || "Section"} — coming soon
      <p className="placeholder-text">
        Configuration lives here, off the daily workflow.
      </p>
    </div>
  );
}

export default PlaceholderScreen;
