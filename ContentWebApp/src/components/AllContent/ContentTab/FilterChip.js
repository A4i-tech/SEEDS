import React from "react";
import { X } from "lucide-react";

const FilterChip = ({ label, onRemove }) => (
  <button type="button" className="filter-chip" onClick={onRemove}>
    {label}
    <X size={13} strokeWidth={2.5} />
  </button>
);

export default FilterChip;
