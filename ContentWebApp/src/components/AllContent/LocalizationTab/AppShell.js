import React from "react";
import { cn } from "../../../utils/cn";
import "../ContentTab/css/ContentTab.css";

export function AppShell({ nav, onNav, children }) {
  const Tab = ({ id, label }) => (
    <button
      type="button"
      className={cn("tab-button", nav === id && "active")}
      onClick={() => onNav(id)}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="tabs-container">
        <Tab id="dashboard" label="Registration" />
        <Tab id="workspace" label="Translate & Review" />
      </div>
      {children}
    </>
  );
}

export default AppShell;
