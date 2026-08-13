import React, { useLayoutEffect, useRef, useState } from "react";

let canvasCtx = null;

function measure(text, font) {
  if (!canvasCtx) canvasCtx = document.createElement("canvas").getContext("2d");
  canvasCtx.font = font;
  return canvasCtx.measureText(text).width;
}

// Binary search on total chars kept (split evenly across the ellipsis) —
// mirrors macOS Finder's middle truncation, which plain CSS text-overflow
// (end-only) can't do.
function truncateMiddle(text, maxWidth, font) {
  if (measure(text, font) <= maxWidth) return text;

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const keepStart = Math.ceil(mid / 2);
    const keepEnd = Math.floor(mid / 2);
    const candidate = `${text.slice(0, keepStart)}…${text.slice(text.length - keepEnd)}`;
    if (measure(candidate, font) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo <= 0) return "…";
  const keepStart = Math.ceil(lo / 2);
  const keepEnd = Math.floor(lo / 2);
  return `${text.slice(0, keepStart)}…${text.slice(text.length - keepEnd)}`;
}

// Renders `text` truncated in the middle (not the end) to fit the width of
// its container. Container must constrain width itself (e.g. a max-width
// column) — this component reads that width, it doesn't set it.
const MiddleEllipsis = ({ text, className }) => {
  const ref = useRef(null);
  const [display, setDisplay] = useState(text);

  useLayoutEffect(() => {
    const el = ref.current;
    const update = () => {
      const font = getComputedStyle(el).font;
      setDisplay(truncateMiddle(text, el.clientWidth, font));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={ref} className={className} title={text} style={{ display: "block", overflow: "hidden", whiteSpace: "nowrap" }}>
      {display}
    </span>
  );
};

export default MiddleEllipsis;
