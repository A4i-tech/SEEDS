import React from "react";

export function Pager({ current, total, label, onChange }) {
  return (
    <div className="content-aggregator-pager">
      <button
        type="button"
        className="secondary-button"
        onClick={() => onChange(current - 1)}
        disabled={current === 0}
      >
        ← Previous
      </button>
      <span className="content-aggregator-pager-position">
        {current + 1} / {total}: {label}
      </span>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onChange(current + 1)}
        disabled={current === total - 1}
      >
        Next →
      </button>
    </div>
  );
}
