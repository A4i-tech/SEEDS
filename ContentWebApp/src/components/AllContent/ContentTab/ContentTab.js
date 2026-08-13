import React from "react";
import { useNavigate } from "react-router-dom";
import ContentFilters from "./ContentFilters";
import ContentTable from "./ContentTable";
import { SyncAllProgress } from "../shared/SyncAllProgress";
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
  titleQuery,
  onTitleQueryChange,
  onUpdateIVR,
  onEdit,
  onView,
  onDelete,
  onLoadMore,
  isUpdatingIVR,
  onSyncAll,
  isTenant,
  syncingAll,
  syncAllProgress,
  courseSyncStates,
  onSyncCourse,
  onDeleteContentAggregatorCourse,
}) => {
  const navigate = useNavigate();

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Audio Content Library</div>
          <div className="card-description">Add and manage educational audio files</div>
        </div>
        <div className="button-group">
          <button
            type="button"
            className="tertiary-button"
            onClick={onUpdateIVR}
            disabled={isUpdatingIVR}
          >
            {isUpdatingIVR ? "Updating..." : "Update IVR"}
          </button>
          {isTenant && (
            <>
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
                onClick={() => navigate("/content/sync-history")}
              >
                Sync History
              </button>
            </>
          )}
          <button
            className="success-button"
            onClick={() => navigate("/content/create")}
          >
            + Add Content
          </button>
        </div>
      </div>

      <SyncAllProgress syncingAll={syncingAll} syncAllProgress={syncAllProgress} />

      <ContentFilters
        options={options}
        selectedValues={selectedValues}
        onFilterChange={onFilterChange}
        titleQuery={titleQuery}
        onTitleQueryChange={onTitleQueryChange}
      />

      <ContentTable
        content={content}
        isLoading={isLoading}
        onEdit={onEdit}
        onView={onView}
        onDelete={onDelete}
        isTenant={isTenant}
        courseSyncStates={courseSyncStates}
        onSyncCourse={onSyncCourse}
        onDeleteContentAggregatorCourse={onDeleteContentAggregatorCourse}
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
    </div>
  );
};

export default ContentTab;
