import React from "react";
import "./RowActions.css";

const VARIANT_CLASS = {
  view: "row-action row-action-view",
  edit: "row-action row-action-edit",
  sync: "row-action row-action-edit",
  delete: "row-action row-action-delete",
};

const RowActions = ({ actions }) => (
  <div className="row-actions">
    {actions.map(({ key, label, icon: Icon, onClick, variant, disabled }) => (
      <button key={key} type="button" className={VARIANT_CLASS[variant]} onClick={onClick} disabled={disabled}>
        <span className="row-action-dot" aria-hidden="true">
          <Icon size={16} strokeWidth={2.5} />
        </span>
        {label}
      </button>
    ))}
  </div>
);

export default RowActions;
