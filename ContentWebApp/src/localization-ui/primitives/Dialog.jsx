import React from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { portalContainer } from "../lib/portal";

/**
 * Dialog (Radix) — accessible modal (focus trap, Esc, aria) styled with tokens.
 * Used sparingly; per the design rules, routine actions use toast-undo, not dialogs.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal container={portalContainer()}>
        <RDialog.Overlay className="loca-ui-overlay" />
        <RDialog.Content className="loca-ui-dialog">
          {title ? <RDialog.Title asChild><h3>{title}</h3></RDialog.Title> : null}
          {description ? <RDialog.Description className="desc">{description}</RDialog.Description> : null}
          {children}
          {footer ? <div className="actions">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/**
 * ConfirmDialog — reserved for irreversible actions only (delete).
 * Everything reversible should use toast-undo instead.
 */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Delete", onConfirm, danger = true,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            {danger ? <AlertTriangle size={15} /> : null}
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

export default Dialog;
