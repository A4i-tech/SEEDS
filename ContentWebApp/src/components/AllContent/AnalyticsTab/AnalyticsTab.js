import React, { useState } from "react";
import { useAnalytics } from "../../../hooks/useAnalytics";
import DateRangeSelector from "./DateRangeSelector";
import AnalyticsStats from "./AnalyticsStats";
import AnalyticsTable from "./AnalyticsTable";
import "./AnalyticsTab.css";
import "../shared/cards.css";

const AnalyticsTab = () => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const { analyticsData, isLoading, error, stats, fetchAnalytics } =
    useAnalytics();

  const handleFetch = (start, end) => {
    fetchAnalytics(start, end);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Analytics Dashboard</div>
          <div className="card-description">
            View call logs and usage statistics for your tenant
          </div>
        </div>
      </div>

      <DateRangeSelector
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onFetch={handleFetch}
        isLoading={isLoading}
      />

      {error && <div className="error-message">{error}</div>}

      {!error && analyticsData && analyticsData.length > 0 && (
        <>
          <AnalyticsStats stats={stats} />
          <AnalyticsTable data={analyticsData} />
        </>
      )}

      {!error &&
        !isLoading &&
        analyticsData &&
        analyticsData.length === 0 &&
        startDate &&
        endDate && (
          <div className="no-data-message">
            No data found for the selected date range. Try selecting different
            dates.
          </div>
        )}

      {!startDate && !endDate && !isLoading && (
        <div className="initial-message">
          Select a date range above to view analytics data.
        </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
