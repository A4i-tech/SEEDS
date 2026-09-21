import React from "react";
import "./cards.css";
import "./buttons.css";
import "./utilities.css";

export function SectionHeader({ title, subtitle, search, onSearch, addLabel, onAdd, children }) {
  return (
    <>
      <div className="card-header">
        <div>
          <h1 className="card-title">{title}</h1>
          <p className="card-description">{subtitle}</p>
        </div>
        <div className="button-group">
          <input
            type="search"
            className="input-field"
            placeholder={`Search ${title.toLowerCase()}`}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={{ width: 200 }}
            aria-label={`Search ${title.toLowerCase()}`}
          />
          {addLabel && (
            <button type="button" className="primary-button" onClick={onAdd}>
              {addLabel}
            </button>
          )}
        </div>
      </div>
      {children}
    </>
  );
}

export default SectionHeader;
