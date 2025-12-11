import React, { useCallback, useMemo, useState, useEffect } from "react";
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
  const [inputValue, setInputValue] = useState("");

  // Sync input value with props
  useEffect(() => {
    if (startDate && endDate) {
      setInputValue(
        `${startDate.toISOString().split("T")[0]} to ${
          endDate.toISOString().split("T")[0]
        }`
      );
    } else {
      setInputValue("");
    }
  }, [startDate, endDate]);

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
    },
    [onStartDateChange, onEndDateChange]
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
            <div className="date-inputs-column">
              <div className="date-input-group">
                <label className="input-label">Date Range</label>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    const parts = value.split(" to ");
                    if (parts.length === 2) {
                      const start = new Date(parts[0]);
                      const end = new Date(parts[1]);
                      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                        onStartDateChange(start);
                        onEndDateChange(end);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.target.blur();
                    }
                  }}
                  placeholder="yyyy-mm-dd to yyyy-mm-dd"
                  className="date-text-input"
                />
              </div>
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
