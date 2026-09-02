import React from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import { portalContainer } from "../lib/portal";

/** Accessible tooltip (Radix). Wrap once near the app root with TooltipProvider. */
export function TooltipProvider({ children }) {
  return <RTooltip.Provider delayDuration={250}>{children}</RTooltip.Provider>;
}

export function Tooltip({ label, children, side = "top" }) {
  if (!label) return children;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal container={portalContainer()}>
        <RTooltip.Content className="loca-ui-tip" side={side} sideOffset={6}>
          {label}
          <RTooltip.Arrow style={{ fill: "var(--ink)" }} />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export default Tooltip;
