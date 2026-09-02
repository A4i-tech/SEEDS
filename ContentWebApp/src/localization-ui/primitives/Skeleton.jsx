import React from "react";
import { cn } from "../lib/cn";

/** Shimmer skeleton block. Pass width/height or a className. */
export function Skeleton({ w, h = 14, r, className, style }) {
  return (
    <span
      className={cn("skel", className)}
      aria-hidden="true"
      style={{ display: "block", width: w, height: h, borderRadius: r, ...style }}
    />
  );
}

/** A few stacked skeleton lines for table/card loading. */
export function SkeletonRows({ rows = 6, height = 44 }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={height} r={10} />
      ))}
    </div>
  );
}

export default Skeleton;
