import React, { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./Pagination.css";

function getPageItems(current, total) {
  const items = [0];
  const showLeftGap = current > 2;
  const showRightGap = current < total - 3;

  if (showLeftGap) items.push("gap-left");
  for (let p = Math.max(1, current - 1); p <= Math.min(total - 2, current + 1); p++) {
    items.push(p);
  }
  if (showRightGap) items.push("gap-right");
  if (total > 1) items.push(total - 1);
  return items;
}

export function Pagination({ current, total, onChange }) {
  const pagesRef = useRef(null);
  const [pillStyle, setPillStyle] = useState(null);

  useLayoutEffect(() => {
    const activeEl = pagesRef.current?.querySelector(".pagination-page.active");
    setPillStyle(activeEl && { width: activeEl.offsetWidth, transform: `translateX(${activeEl.offsetLeft}px)` });
  }, [current, total]);

  if (total <= 1) return null;

  return (
    <div className="pagination">
      <button
        type="button"
        className="pagination-arrow"
        onClick={() => onChange(current - 1)}
        disabled={current === 0}
        aria-label="Previous"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
      </button>
      <div className="pagination-pages" ref={pagesRef}>
        {pillStyle && <span className="pagination-active-pill" style={pillStyle} />}
        {getPageItems(current, total).map((item) =>
          typeof item === "number" ? (
            <button
              key={item}
              type="button"
              className={item === current ? "pagination-page active" : "pagination-page"}
              onClick={() => onChange(item)}
            >
              {item + 1}
            </button>
          ) : (
            <span key={item} className="pagination-ellipsis">…</span>
          )
        )}
      </div>
      <button
        type="button"
        className="pagination-arrow"
        onClick={() => onChange(current + 1)}
        disabled={current === total - 1}
        aria-label="Next"
      >
        <ChevronRight size={18} strokeWidth={2.5} />
      </button>
    </div>
  );
}
