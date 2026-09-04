import React from "react";

export function EmptyState({ title, message, action }) {
  return (
    <div className="empty">
      {title ? <h4>{title}</h4> : null}
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export default EmptyState;
