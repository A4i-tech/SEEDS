import React, { useState } from "react";
import { fuzzyMatch } from "../../../utils/fuzzyMatch";
import FilterOptionGroup from "./FilterOptionGroup";

const groupByCategory = (opts) => {
  const groups = new Map();
  opts.forEach((opt) => {
    if (!groups.has(opt.category)) groups.set(opt.category, []);
    groups.get(opt.category).push(opt);
  });
  return Array.from(groups.entries());
};

const FilterSearchDropdown = ({ options, onSelect, query, onQueryChange }) => {
  const [open, setOpen] = useState(false);

  const matches = query ? options.filter((opt) => fuzzyMatch(opt.name, query)) : options;
  const groups = groupByCategory(matches);

  const handleSelect = (opt) => {
    onSelect(opt);
    onQueryChange("");
  };

  return (
    <div className="content-filters-search">
      <input
        type="text"
        className="filter-search-input"
        placeholder="Search by title, language, or type…"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && groups.length > 0 && (
        <ul className="filter-search-results">
          {groups.map(([category, opts]) => (
            <FilterOptionGroup key={category} category={category} options={opts} onSelect={handleSelect} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default FilterSearchDropdown;
