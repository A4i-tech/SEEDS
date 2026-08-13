import React, { Fragment } from "react";
import { ChevronLeft, Home } from "lucide-react";
import "./Breadcrumb.css";

export function Breadcrumb({ items, className = "" }) {
  return (
    <nav className={`breadcrumb ${className}`.trim()} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronLeft size={16} strokeWidth={2.5} className="breadcrumb-sep" aria-hidden="true" />}
          {item.onClick ? (
            <button type="button" className="breadcrumb-link" onClick={item.onClick}>
              {i === 0 && <Home size={14} strokeWidth={2.5} />}
              {item.label}
            </button>
          ) : (
            <span className="breadcrumb-current">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
