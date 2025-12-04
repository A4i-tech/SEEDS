import React, { useState, useCallback, useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../shared/buttons.css";
import "./DateRangeSelector.css";

const QUICK_SELECT_OPTIONS = [
  { label: "Last 10 Days", days: 10 },
  { label: "Last 15 Days", days: 15 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
];

const DateRangeSelector = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onFetch,
  isLoading,
}) => {
  const [showCustomRange, setShowCustomRange] = useState(false);

  const handleFetch = useCallback(() => {
    if (startDate && endDate) {
      onFetch(startDate, endDate);
    }
  }, [startDate, endDate, onFetch]);

  const handleQuickSelect = useCallback(
    (days) => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);

      onStartDateChange(start);
      onEndDateChange(end);
      onFetch(start, end);
    },
    [onStartDateChange, onEndDateChange, onFetch]
  );

  const toggleCustomRange = useCallback(() => {
    setShowCustomRange((prev) => !prev);
  }, []);

  const isCustomFetchDisabled = useMemo(
    () => !startDate || !endDate || isLoading,
    [startDate, endDate, isLoading]
  );

  return (
    <div className="date-range-selector">
      {/* Quick Select Section */}
      <div style={{ marginBottom: showCustomRange ? "20px" : "0" }}>
        <label className="section-label">Quick Select</label>
        <div className="button-group">
          {QUICK_SELECT_OPTIONS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => handleQuickSelect(days)}
              disabled={isLoading}
              className="quick-select-button"
              aria-label={`Select ${label.toLowerCase()}`}
            >
              {label}
            </button>
          ))}

          {/* Custom Range Toggle */}
          <button
            onClick={toggleCustomRange}
            disabled={isLoading}
            className={`toggle-button ${showCustomRange ? "active" : ""}`}
            aria-label={
              showCustomRange
                ? "Hide custom date range"
                : "Show custom date range"
            }
            aria-expanded={showCustomRange}
          >
            {showCustomRange ? "Hide Custom Range" : "Custom Range"}
          </button>
        </div>
      </div>

      {/* Custom Date Range Section */}
      {showCustomRange && (
        <div
          className="custom-range-box"
          role="region"
          aria-label="Custom date range selector"
        >
          <label className="section-label">Custom Date Range</label>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="start-date-picker" className="field-label">
                Start Date
              </label>
              <DatePicker
                id="start-date-picker"
                selected={startDate}
                onChange={onStartDateChange}
                maxDate={new Date()}
                dateFormat="yyyy-MM-dd"
                className="mintgreen"
                placeholderText="Select start date"
                disabled={isLoading}
                aria-label="Select start date"
              />
            </div>
            <div className="form-field">
              <label htmlFor="end-date-picker" className="field-label">
                End Date
              </label>
              <DatePicker
                id="end-date-picker"
                selected={endDate}
                onChange={onEndDateChange}
                minDate={startDate}
                maxDate={new Date()}
                dateFormat="yyyy-MM-dd"
                className="mintgreen"
                placeholderText="Select end date"
                disabled={isLoading}
                aria-label="Select end date"
              />
            </div>
            <div>
              <button
                className="primary-button"
                onClick={handleFetch}
                disabled={isCustomFetchDisabled}
                aria-label="Fetch analytics for custom date range"
              >
                {isLoading ? "Loading..." : "Fetch Analytics"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangeSelector;
