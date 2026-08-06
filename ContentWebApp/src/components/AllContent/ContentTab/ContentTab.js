import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentFilters from "./ContentFilters";
import ContentTable from "./ContentTable";
import SubodhaSyncHistory from "../../SubodhaSyncHistory";
import "./css/ContentTab.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const ContentTab = ({
  content,
  allContent,
  isLoading,
  paginationInfo,
  isFiltered,
  options,
  selectedValues,
  onFilterChange,
  onResetFilters,
  onUpdateIVR,
  onEdit,
  onView,
  onDelete,
  onLoadMore,
  isUpdatingIVR,
  multiselectRef,
  onSyncAll,
  syncingAll,
  syncAllProgress,
  courseSyncStates,
  onSyncCourse,
  onDeleteSubodhaCourse,
}) => {
  const navigate = useNavigate();
  const [showSyncHistory, setShowSyncHistory] = useState(false);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Audio Content Library</div>
          <div className="card-description">Add and manage educational audio files</div>
        </div>
        <div className="button-group">
          <button className="tertiary-button" onClick={onResetFilters}>
            Reset Filters
          </button>
          <button
            type="button"
            className="tertiary-button button-ml-8"
            onClick={onUpdateIVR}
            disabled={isUpdatingIVR}
          >
            {isUpdatingIVR ? "Updating..." : "Update IVR"}
          </button>
          <button
            type="button"
            className="secondary-button button-ml-8"
            onClick={onSyncAll}
            disabled={syncingAll}
          >
            {syncingAll ? "Syncing..." : "Sync All"}
          </button>
          <button
            type="button"
            className="tertiary-button button-ml-8"
            onClick={() => setShowSyncHistory(true)}
          >
            Sync History
          </button>
          <button
            className="success-button"
            onClick={() => navigate("/content/create")}
          >
            + Add Content
          </button>
        </div>
      </div>

      {syncingAll && syncAllProgress && syncAllProgress.total > 0 && (
        <div className="subodha-sync-all-progress">
          <div className="subodha-sync-all-progress-track">
            <div
              className="subodha-sync-all-progress-fill"
              style={{ width: `${Math.min(100, Math.round((syncAllProgress.processed / syncAllProgress.total) * 100))}%` }}
            />
          </div>
          <span className="subodha-sync-all-progress-label">
            {syncAllProgress.processed}/{syncAllProgress.total} courses synced
          </span>
        </div>
      )}

      <ContentFilters
        options={options}
        selectedValues={selectedValues}
        onFilterChange={onFilterChange}
        multiselectRef={multiselectRef}
      />

      <ContentTable
        content={content}
        isLoading={isLoading}
        onEdit={onEdit}
        onView={onView}
        onDelete={onDelete}
        courseSyncStates={courseSyncStates}
        onSyncCourse={onSyncCourse}
        onDeleteSubodhaCourse={onDeleteSubodhaCourse}
      />

      {!isFiltered && paginationInfo.hasMore && (
        <div className="load-more-wrapper">
          <button
            type="button"
            className="secondary-button"
            onClick={onLoadMore}
            disabled={isLoading}
          >
            {isLoading ? "Loading more..." : "Load more"}
          </button>
        </div>
      )}

      {showSyncHistory && <SubodhaSyncHistory onClose={() => setShowSyncHistory(false)} />}
    </div>
  );
};

export default ContentTab;
