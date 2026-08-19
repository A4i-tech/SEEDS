import React from "react";
import "./RowActions.css";

const VARIANT_CLASS = {
  view: "row-action row-action-view",
  edit: "row-action row-action-edit",
  sync: "row-action row-action-edit",
  delete: "row-action row-action-delete",
};

const RowActions = ({ actions, horizontal = false }) => (
  <div className={horizontal ? "row-actions row-actions-horizontal" : "row-actions"}>
    {actions.map(({ key, label, onClick, variant, disabled }) => (
      <button key={key} type="button" className={VARIANT_CLASS[variant]} onClick={onClick} disabled={disabled}>
        {label}
      </button>
    ))}
  </div>
);

export default RowActions;
