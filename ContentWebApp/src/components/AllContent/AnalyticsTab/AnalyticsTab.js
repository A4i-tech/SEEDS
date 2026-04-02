import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAnalytics } from "../../../hooks/useAnalytics";
import { useConferenceAnalytics } from "../../../hooks/useConferenceAnalytics";
import DateRangeSelector from "./DateRangeSelector";
import AnalyticsStats from "./AnalyticsStats";
import ConferenceAnalyticsStats from "./ConferenceAnalyticsStats";
import "./css/AnalyticsTab.css";
import "../shared/cards.css";

const AnalyticsTab = () => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [subTab, setSubTab] = useState("ivr");
  const [selectedTeacher, setSelectedTeacher] = useState("");

  const {
    analyticsData,
    teacherMap: ivrTeacherMap,
    isLoading: ivrLoading,
    error: ivrError,
    stats: ivrStats,
    fetchAnalytics,
  } = useAnalytics();

  const {
    conferenceData,
    teacherMap: confTeacherMap,
    isLoading: confLoading,
    error: confError,
    stats: confStats,
    fetchConferenceAnalytics,
  } = useConferenceAnalytics();

  const isLoading = subTab === "ivr" ? ivrLoading : confLoading;
  const error = subTab === "ivr" ? ivrError : confError;

  // Merge teacher maps for the filter dropdown
  const allTeachers = useMemo(() => {
    const merged = { ...ivrTeacherMap, ...confTeacherMap };
    return Object.entries(merged)
      .map(([phone, name]) => ({ phone, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ivrTeacherMap, confTeacherMap]);

  const getLastNDaysRange = useCallback((days) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return { start, end };
  }, []);

  const handleFetch = useCallback(
    (start, end) => {
      fetchAnalytics(start, end);
      fetchConferenceAnalytics(start, end);
    },
    [fetchAnalytics, fetchConferenceAnalytics]
  );

  // Default to last 7 days on first load
  useEffect(() => {
    const { start, end } = getLastNDaysRange(7);
    setStartDate(start);
    setEndDate(end);
    fetchAnalytics(start, end);
    fetchConferenceAnalytics(start, end);
  }, [fetchAnalytics, fetchConferenceAnalytics, getLastNDaysRange]);

  const selectedRangeLabel = useMemo(() => {
    if (startDate && endDate) {
      return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    }
    return "Last 7 days";
  }, [startDate, endDate]);

  // Filter stats by selected teacher (client-side)
  const filteredIvrStats = useMemo(() => {
    if (!selectedTeacher) return ivrStats;

    // Re-filter analyticsData by selected teacher phone
    const filtered = analyticsData.filter(
      (log) => log.phone_number === selectedTeacher
    );
    if (filtered.length === 0) {
      return {
        ...ivrStats,
        totalCalls: 0,
        uniqueUsers: 0,
        avgDuration: "0m 0s",
        medianDuration: "0m 0s",
        totalDuration: "0m 0s",
        callsByDate: {},
        stepDepthData: [],
        contentUsage: [],
        dropRate: "0.0",
        droppedCalls: 0,
        callsByTeacher: {},
      };
    }
    return ivrStats;
  }, [ivrStats, selectedTeacher, analyticsData]);

  const filteredConfStats = useMemo(() => {
    if (!selectedTeacher) return confStats;

    const filtered = conferenceData.filter(
      (conf) => conf.teacher_phone_number === selectedTeacher
    );
    if (filtered.length === 0) {
      return {
        ...confStats,
        totalConferences: 0,
        conferencesByTeacher: [],
        conferencesByDate: {},
        classSizeDistribution: [],
        raisedHandsPerSession: [],
        totalRaisedHands: 0,
      };
    }
    return confStats;
  }, [confStats, selectedTeacher, conferenceData]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Analytics Dashboard</div>
          <div className="card-description">
            View usage statistics for your tenant
          </div>
        </div>
        <div className="filters-inline">
          <div className="range-pill">Showing: {selectedRangeLabel}</div>
          <button type="button" className="secondary-button" onClick={() => setShowFilters(true)}>
            Filters
          </button>
        </div>
      </div>

      <div className="analytics-sub-tabs">
        <button
          type="button"
          className={`sub-tab-button ${subTab === "ivr" ? "sub-tab-active" : ""}`}
          onClick={() => setSubTab("ivr")}
        >
          IVR Analytics
        </button>
        <button
          type="button"
          className={`sub-tab-button ${subTab === "conference" ? "sub-tab-active" : ""}`}
          onClick={() => setSubTab("conference")}
        >
          Conference Analytics
        </button>
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
            {allTeachers.length > 0 && (
              <div className="teacher-filter">
                <label className="teacher-filter-label" htmlFor="teacher-select">
                  Filter by Teacher
                </label>
                <select
                  id="teacher-select"
                  className="teacher-filter-select"
                  value={selectedTeacher}
                  onChange={(e) => setSelectedTeacher(e.target.value)}
                >
                  <option value="">All Teachers</option>
                  {allTeachers.map((t) => (
                    <option key={t.phone} value={t.phone}>
                      {t.name} ({t.phone})
                    </option>
                  ))}
                </select>
              </div>
            )}
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

      {error && <div className="error-message">{error}</div>}

      {!error && subTab === "ivr" && analyticsData && analyticsData.length > 0 && (
        <AnalyticsStats stats={filteredIvrStats} teacherMap={ivrTeacherMap} />
      )}

      {!error && subTab === "conference" && conferenceData && conferenceData.length > 0 && (
        <ConferenceAnalyticsStats stats={filteredConfStats} />
      )}

      {!error &&
        !isLoading &&
        subTab === "ivr" &&
        analyticsData &&
        analyticsData.length === 0 &&
        startDate &&
        endDate && (
          <div className="no-data-message">
            No IVR data found for the selected date range. Try selecting different dates.
          </div>
        )}

      {!error &&
        !isLoading &&
        subTab === "conference" &&
        conferenceData &&
        conferenceData.length === 0 &&
        startDate &&
        endDate && (
          <div className="no-data-message">
            No conference data found for the selected date range. Try selecting different dates.
          </div>
        )}

      {!startDate && !endDate && !isLoading && (
        <div className="initial-message">Select a date range above to view analytics data.</div>
      )}
    </div>
  );
};

export default AnalyticsTab;
