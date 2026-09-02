import React from "react";
import * as RPopover from "@radix-ui/react-popover";
import { portalContainer } from "../lib/portal";

/** Popover (Radix) — lightweight anchored panel styled with tokens. */
export function Popover({ open, onOpenChange, trigger, children, align = "start" }) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal container={portalContainer()}>
        <RPopover.Content className="loca-ui-popover" align={align} sideOffset={8}>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export default Popover;
