import React from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { portalContainer } from "../lib/portal";
import "../../components/AllContent/shared/modal.css";

export function Dialog({ open, onOpenChange, title, description, children, footer }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal container={portalContainer()}>
        <RDialog.Overlay className="modal-overlay" />
        <RDialog.Content className="modal-overlay" style={{ background: "transparent" }}>
          <div className="modal-card">
            <div className="modal-header">
              {title ? (
                <RDialog.Title asChild>
                  <span className="modal-title">{title}</span>
                </RDialog.Title>
              ) : null}
              <RDialog.Close asChild>
                <button type="button" className="modal-close">
                  ✕
                </button>
              </RDialog.Close>
            </div>
            <div className="modal-body">
              {description ? (
                <RDialog.Description>{description}</RDialog.Description>
              ) : null}
              {children}
              {footer ? <div className="modal-actions">{footer}</div> : null}
            </div>
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  danger = true,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <button className="action-ghost-button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className={danger ? "row-action row-action-delete" : "primary-button"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}

export default Dialog;
