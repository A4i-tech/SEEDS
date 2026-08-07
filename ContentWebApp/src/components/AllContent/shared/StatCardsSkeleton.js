import React from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

// Matches the `.stat-cards` / `.stat-card` layout used by DashboardStats and
// SchoolDashboardStats — pass the same count of cards the real view renders.
const StatCardsSkeleton = ({ count = 4 }) => (
  <SkeletonTheme baseColor="var(--color-skeleton-base)" highlightColor="var(--color-skeleton-highlight)">
    <div className="stat-cards">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card">
          <div className="stat-label">
            <Skeleton width="60%" />
          </div>
          <div className="stat-value">
            <Skeleton width="40%" height={28} />
          </div>
        </div>
      ))}
    </div>
  </SkeletonTheme>
);

export default StatCardsSkeleton;
