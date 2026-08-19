import React from "react";

const FilterOptionGroup = ({ category, options, onSelect }) => (
  <li className="filter-group">
    <div className="filter-group-title">{category}</div>
    <ul>
      {options.map((opt) => (
        <li key={opt.id}>
          <button type="button" onMouseDown={() => onSelect(opt)}>
            {opt.name}
          </button>
        </li>
      ))}
    </ul>
  </li>
);

export default FilterOptionGroup;
