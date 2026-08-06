import React from "react";
import "./RowActions.css";

const VARIANT_CLASS = {
  view: "row-action row-action-view",
  edit: "row-action row-action-edit",
  sync: "row-action row-action-edit",
  delete: "row-action row-action-delete",
};

// Traffic-light row actions: green = safe read, amber = caution/changes data,
// red = destructive. The icon+label together carry meaning — color alone
// never does (WCAG 1.4.1), and red/amber/green survives red-green color
// blindness since it isn't a bare red/green pair.
//
// Plain inline-block buttons, no flex wrapper — a flex container here kept
// collapsing to one-button-per-line inside the table cell.
const RowActions = ({ actions }) => (
  <span className="row-actions">
    {actions.map(({ key, label, icon: Icon, onClick, variant, disabled }) => (
      <button key={key} type="button" className={VARIANT_CLASS[variant]} onClick={onClick} disabled={disabled}>
        <span className="row-action-dot" aria-hidden="true">
          <Icon size={16} strokeWidth={2.5} />
        </span>
        {label}
      </button>
    ))}
  </span>
);

export default RowActions;
