import React, { useCallback, useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../shared/buttons.css";
import "./css/DateRangeSelector.css";

const QUICK_SELECT_OPTIONS = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 15 Days", days: 15 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
];

const diffInDays = (start, end) => {
  if (!start || !end) return null;
  const startMs = new Date(start).setHours(0, 0, 0, 0);
  const endMs = new Date(end).setHours(0, 0, 0, 0);
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
};

const DateRangeSelector = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onFetch,
  isLoading,
  onClose,
}) => {
  const handleFetch = useCallback(() => {
    if (startDate && endDate) {
      onFetch(startDate, endDate);
      if (onClose) onClose();
    }
  }, [startDate, endDate, onFetch, onClose]);

  const handleRangeChange = useCallback(
    (dates) => {
      const [start, end] = dates;
      onStartDateChange(start);
      onEndDateChange(end);
    },
    [onStartDateChange, onEndDateChange]
  );

  const handleQuickSelect = useCallback(
    (days) => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - days);

      onStartDateChange(start);
      onEndDateChange(end);
      onFetch(start, end);
      if (onClose) onClose();
    },
    [onStartDateChange, onEndDateChange, onFetch, onClose]
  );

  const isCustomFetchDisabled = useMemo(
    () => !startDate || !endDate || isLoading,
    [startDate, endDate, isLoading]
  );

  const isPresetActive = useCallback(
    (days) => {
      const diff = diffInDays(startDate, endDate);
      return diff === days;
    },
    [startDate, endDate]
  );

  return (
    <div className="date-range-selector">
      {/* Quick Select Section */}
      <div className="quick-select-row">
        <label className="section-label">Quick Select</label>
        <div className="button-group">
          {QUICK_SELECT_OPTIONS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => handleQuickSelect(days)}
              disabled={isLoading}
              className={`quick-select-button ${
                isPresetActive(days) ? "active" : ""
              }`}
              aria-label={`Select ${label.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Single Calendar Range Picker */}
      <div
        className="range-picker-box"
        role="region"
        aria-label="Date range selector"
      >
        <label className="section-label">Date Range</label>
        <div className="range-picker-row">
          <DatePicker
            selectsRange
            startDate={startDate}
            endDate={endDate}
            onChange={handleRangeChange}
            maxDate={new Date()}
            dateFormat="yyyy-MM-dd"
            className="mintgreen"
            inline
          />
          <div className="range-actions">
            <div className="selected-range">
              {startDate && endDate ? (
                <>
                  <span>{startDate.toLocaleDateString()}</span>
                  <span className="range-separator">to</span>
                  <span>{endDate.toLocaleDateString()}</span>
                </>
              ) : (
                <span>Select start and end dates</span>
              )}
            </div>
            <button
              className="primary-button"
              onClick={handleFetch}
              disabled={isCustomFetchDisabled}
              aria-label="Apply date range to analytics"
            >
              {isLoading ? "Loading..." : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DateRangeSelector;
