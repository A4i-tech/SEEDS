import React from "react";
import { LayoutGrid, Repeat2 } from "lucide-react";
import { cn } from "./lib/cn";

export function AppShell({ nav, onNav, flush, children }) {
  const Item = ({ id, label, icon: Icon, count }) => (
    <button className={cn("s-item", nav === id && "on")} onClick={() => onNav(id)}>
      <Icon aria-hidden="true" size={18} strokeWidth={2} />
      <span className="s-label">{label}</span>
      {count ? <span className="s-count num">{count}</span> : null}
    </button>
  );

  return (
    <div className="loca-shell">
      <aside className="loca-side" aria-label="Localization navigation">
        <div className="s-scroll">
          <Item id="dashboard" label="Registration" icon={LayoutGrid} />
          <Item id="workspace" label="Translate & Review" icon={Repeat2} />
        </div>
      </aside>

      <div className="loca-main">
        <main className={cn("loca-content", flush && "flush")}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
