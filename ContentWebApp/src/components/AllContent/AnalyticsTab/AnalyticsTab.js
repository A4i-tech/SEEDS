import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAnalytics } from "../../../hooks/useAnalytics";
import { useDashboard } from "../../../hooks/useDashboard";
import { getRole } from "../../../utils/authHelpers";
import DateRangeSelector from "./DateRangeSelector";
import AnalyticsStats from "./AnalyticsStats";
import DashboardStats from "./DashboardStats";
import SchoolDashboardStats from "./SchoolDashboardStats";
import "./css/AnalyticsTab.css";
import "../shared/cards.css";

const AnalyticsTab = () => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const { analyticsData, isLoading, error, stats, fetchAnalytics } = useAnalytics();
  const { dashboard, schoolDashboard, fetchDashboard, fetchSchoolDashboard } = useDashboard();
  const role = getRole();
  const isTenant = role === "tenant";
  const isSchoolAdmin = role === "school_admin";

  const getLastNDaysRange = useCallback((days) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return { start, end };
  }, []);

  const handleFetch = useCallback(
    (start, end) => {
      fetchAnalytics(start, end);
    },
    [fetchAnalytics]
  );

  // Default to last 7 days on first load
  useEffect(() => {
    const { start, end } = getLastNDaysRange(7);
    setStartDate(start);
    setEndDate(end);
    fetchAnalytics(start, end);
    if (isTenant) fetchDashboard();
    if (isSchoolAdmin) fetchSchoolDashboard();
  }, [fetchAnalytics, fetchDashboard, fetchSchoolDashboard, getLastNDaysRange, isTenant, isSchoolAdmin]);

  const selectedRangeLabel = useMemo(() => {
    if (startDate && endDate) {
      return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    }
    return "Last 7 days";
  }, [startDate, endDate]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Analytics Dashboard</div>
          <div className="card-description">
            View call logs and usage statistics for your tenant
          </div>
        </div>
        <div className="filters-inline">
          <div className="range-pill">Showing: {selectedRangeLabel}</div>
          <button type="button" className="secondary-button" onClick={() => setShowFilters(true)}>
            Filters
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filters-overlay" role="dialog" aria-modal="true">
          <div className="filters-modal">
            <div className="filters-modal-header">
              <div>
                <div className="filters-title">Filters</div>
                <div className="filters-subtitle">Adjust your analytics view</div>
              </div>
              <button
                type="button"
                className="action-ghost-button"
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
              >
                Close
              </button>
            </div>
            <DateRangeSelector
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onFetch={handleFetch}
              isLoading={isLoading}
              onClose={() => setShowFilters(false)}
            />
          </div>
        </div>
      )}

      {isTenant && dashboard && <DashboardStats dashboard={dashboard} />}
      {isSchoolAdmin && schoolDashboard && <SchoolDashboardStats dashboard={schoolDashboard} />}

      {error && <div className="error-message">{error}</div>}

      {!error && analyticsData && analyticsData.length > 0 && (
        <>
          <AnalyticsStats stats={stats} />
        </>
      )}

      {!error &&
        !isLoading &&
        analyticsData &&
        analyticsData.length === 0 &&
        startDate &&
        endDate && (
          <div className="no-data-message">
            No data found for the selected date range. Try selecting different dates.
          </div>
        )}

      {!startDate && !endDate && !isLoading && (
        <div className="initial-message">Select a date range above to view analytics data.</div>
      )}
    </div>
  );
};

export default AnalyticsTab;
