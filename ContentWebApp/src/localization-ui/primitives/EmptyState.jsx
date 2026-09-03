import React from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="empty">
      <span className="ic">
        <Icon />
      </span>
      {title ? <h4>{title}</h4> : null}
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export default EmptyState;
