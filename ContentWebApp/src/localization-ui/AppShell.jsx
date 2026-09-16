import React from "react";
import { cn } from "./lib/cn";
import "../components/AllContent/ContentTab/css/ContentTab.css";

export function AppShell({ nav, onNav, flush, children }) {
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
    <div className="loca-shell">
      <div className="tabs-container loca-tabs">
        <Tab id="dashboard" label="Registration" />
        <Tab id="workspace" label="Translate & Review" />
      </div>

      <div className="loca-main">
        <main className={cn("loca-content", flush && "flush")}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
