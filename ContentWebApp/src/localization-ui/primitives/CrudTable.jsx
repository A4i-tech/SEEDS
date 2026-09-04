import React from "react";
import { EmptyState } from "./EmptyState";

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="row-actions row-actions-horizontal">
      <button className="row-action row-action-edit" onClick={onEdit}>
        Edit
      </button>
      <button className="row-action row-action-delete" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

export function CrudTable({ columns, rows, getId, onEdit, onDelete, emptyTitle, emptyMessage }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.header}</th>
          ))}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={getId(row)}>
            {columns.map((c) => (
              <td key={c.key} className={c.className}>
                {c.render(row)}
              </td>
            ))}
            <td>
              <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default CrudTable;
