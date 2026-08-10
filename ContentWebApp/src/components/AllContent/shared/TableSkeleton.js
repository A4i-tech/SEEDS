import React from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const TableSkeleton = ({ columns, rows = 4 }) => (
  <SkeletonTheme baseColor="var(--color-skeleton-base)" highlightColor="var(--color-skeleton-highlight)">
    <table className="content-table">
      <thead>
        <tr>
          {columns.map((label) => (
            <th key={label} className="table-header">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="table-row-white">
            {columns.map((label) => (
              <td key={label} className="table-cell">
                <Skeleton width="70%" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </SkeletonTheme>
);

export default TableSkeleton;
