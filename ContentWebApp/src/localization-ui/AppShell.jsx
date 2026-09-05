import React from "react";
import { cn } from "./lib/cn";

export function AppShell({ nav, onNav, flush, children }) {
  const Item = ({ id, label, count }) => (
    <button className={cn("s-item", nav === id && "on")} onClick={() => onNav(id)}>
      <span className="s-label">{label}</span>
      {count ? <span className="s-count num">{count}</span> : null}
    </button>
  );

  return (
    <div className="loca-shell">
      <aside className="loca-side" aria-label="Localization navigation">
        <div className="s-scroll">
          <Item id="dashboard" label="Registration" />
          <Item id="workspace" label="Translate & Review" />
        </div>
      </aside>

      <div className="loca-main">
        <main className={cn("loca-content", flush && "flush")}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
