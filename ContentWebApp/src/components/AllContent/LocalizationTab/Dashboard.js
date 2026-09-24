import React from "react";
import "../shared/cards.css";
import { OnboardingCard } from "./OnboardingCard";
import { ManageScreen } from "./Manage";

export function DashboardScreen({ loc }) {
  return (
    <div className="registration-flex-card">
      <OnboardingCard loc={loc} />
      <ManageScreen nav="sites" loc={loc} />
    </div>
  );
}

export default DashboardScreen;
