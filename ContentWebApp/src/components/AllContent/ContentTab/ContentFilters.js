import React from "react";
import FilterChip from "./FilterChip";
import FilterSearchDropdown from "./FilterSearchDropdown";
import "./css/ContentFilters.css";

const sameOption = (a, b) => a.category === b.category && a.id === b.id;

const ContentFilters = ({ options, selectedValues, onFilterChange, titleQuery, onTitleQueryChange }) => {
  const available = options.filter((opt) => !selectedValues.some((v) => sameOption(v, opt)));

  const addFilter = (opt) => onFilterChange([...selectedValues, opt]);
  const removeFilter = (opt) => onFilterChange(selectedValues.filter((v) => !sameOption(v, opt)));

  return (
    <div className="content-filters">
      <div className="content-filters-label">Filter content</div>

      {selectedValues.length > 0 && (
        <div className="content-filters-chips">
          {selectedValues.map((v) => (
            <FilterChip key={`${v.category}-${v.id}`} label={v.name} onRemove={() => removeFilter(v)} />
          ))}
          <button type="button" className="filter-clear-all" onClick={() => onFilterChange([])}>
            Clear all
          </button>
        </div>
      )}

      <FilterSearchDropdown
        options={available}
        onSelect={addFilter}
        query={titleQuery}
        onQueryChange={onTitleQueryChange}
      />
    </div>
  );
};

export default ContentFilters;
