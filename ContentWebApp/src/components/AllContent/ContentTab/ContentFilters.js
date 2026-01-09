import React from "react";
import Multiselect from "multiselect-react-dropdown";
import "../shared/cards.css";
import "../shared/utilities.css";

const ContentFilters = ({ options, onFilterChange, selectedValues, multiselectRef }) => (
  <div className="filter-wrapper">
    <p className="filter-label">Filter content</p>
    <Multiselect
      ref={multiselectRef}
      options={options}
      selectedValues={selectedValues}
      onSelect={onFilterChange}
      onRemove={onFilterChange}
      displayValue="name"
      groupBy="category"
      style={{
        chips: { background: "#0f172a" },
        multiselectContainer: { color: "#0f172a" },
        option: { color: "#0f172a" },
      }}
    />
  </div>
);

export default ContentFilters;
