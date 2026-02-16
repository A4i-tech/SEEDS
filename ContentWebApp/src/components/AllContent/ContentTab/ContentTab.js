import React from "react";
import { useNavigate } from "react-router-dom";
import ContentFilters from "./ContentFilters";
import ContentTable from "./ContentTable";
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
}) => {
  const navigate = useNavigate();

  return (
    <div className="card content-tab-card">
      <div className="card-header">
        <div>
          <div className="card-title">Audio Content Library</div>
          <div className="card-description">Add and manage educational audio files</div>
        </div>
        <div className="button-group">
          <button className="primary-button" onClick={onResetFilters}>
            Reset Filters
          </button>
          <button
            type="button"
            className="primary-button button-ml-8"
            onClick={onUpdateIVR}
            disabled={isUpdatingIVR}
          >
            {isUpdatingIVR ? "Updating..." : "Update IVR"}
          </button>
          <button
            className="primary-button button-add-content"
            onClick={() => navigate("/content/create")}
          >
            + Add Content
          </button>
        </div>
      </div>

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
