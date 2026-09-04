import React from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { portalContainer } from "../lib/portal";

export function Drawer({ open, onOpenChange, title, subtitle, children, footer }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal container={portalContainer()}>
        <RDialog.Overlay className="loca-ui-overlay" />
        <RDialog.Content className="loca-ui-drawer" aria-describedby={undefined}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              padding: "16px 20px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              {title ? (
                <RDialog.Title asChild>
                  <h3 style={{ fontSize: "var(--fs-16)" }}>{title}</h3>
                </RDialog.Title>
              ) : null}
              {subtitle ? (
                <div
                  className="mono"
                  style={{ fontSize: "var(--fs-12)", color: "var(--muted)", marginTop: 4 }}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>
            <RDialog.Close asChild>
              <button className="modal-close" aria-label="Close">
                <X size={16} />
              </button>
            </RDialog.Close>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>{children}</div>
          {footer ? (
            <div
              style={{
                borderTop: "1px solid var(--line)",
                padding: "12px 20px",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {footer}
            </div>
          ) : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export default Drawer;
