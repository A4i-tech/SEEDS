import React from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

export function CourseContentSkeleton() {
  return (
    <SkeletonTheme baseColor="var(--color-skeleton-base)" highlightColor="var(--color-skeleton-highlight)">
      <Skeleton width="40%" height={24} />
      <ul className="content-aggregator-section-list">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="content-aggregator-section-list-item">
            <Skeleton width={`${70 - (i % 3) * 10}%`} />
          </li>
        ))}
      </ul>
    </SkeletonTheme>
  );
}
