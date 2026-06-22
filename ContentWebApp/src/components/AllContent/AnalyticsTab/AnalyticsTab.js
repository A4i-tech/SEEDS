import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAnalytics } from "../../../hooks/useAnalytics";
import { useDashboard } from "../../../hooks/useDashboard";
import { useExtendedAnalytics } from "../../../hooks/useExtendedAnalytics";
import { getRole } from "../../../utils/authHelpers";
import AnalyticsFilters from "./AnalyticsFilters";
import AnalyticsStats from "./AnalyticsStats";
import DashboardStats from "./DashboardStats";
import SchoolDashboardStats from "./SchoolDashboardStats";
import ConferenceAnalytics from "./ConferenceAnalytics";
import IvrAnalytics from "./IvrAnalytics";
import "./css/AnalyticsTab.css";
import "../shared/cards.css";

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "conference", label: "Conferences" },
  { key: "ivr", label: "IVR" },
];

const AnalyticsTab = () => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [schoolId, setSchoolId] = useState(null);
  const [teacherId, setTeacherId] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");

  const { analyticsData, isLoading, error, stats, fetchAnalytics } = useAnalytics();
  const { dashboard, schoolDashboard, fetchDashboard, fetchSchoolDashboard } = useDashboard();
  const {
    ivrData,
    conferenceData,
    isLoading: isExtendedLoading,
    error: extendedError,
    fetchIvrAnalytics,
    fetchConferenceAnalytics,
    exportCSV,
  } = useExtendedAnalytics();

  const role = getRole();
  const isTenant = role === "tenant";
  const isSchoolAdmin = role === "school_admin";

  const getLastNDaysRange = useCallback((days) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return { start, end };
  }, []);

  const filters = useMemo(() => ({ schoolId, teacherId }), [schoolId, teacherId]);

  const fetchSection = useCallback(
    (section, start, end, currentFilters) => {
      if (section === "overview") {
        fetchAnalytics(start, end);
      } else if (section === "conference") {
        fetchConferenceAnalytics(start, end, currentFilters);
      } else if (section === "ivr") {
        fetchIvrAnalytics(start, end, currentFilters);
      }
    },
    [fetchAnalytics, fetchConferenceAnalytics, fetchIvrAnalytics]
  );

  const handleFetch = useCallback(
    (start, end) => {
      fetchSection(activeSection, start, end, filters);
    },
    [fetchSection, activeSection, filters]
  );

  const handleSectionChange = useCallback(
    (section) => {
      setActiveSection(section);
      if (startDate && endDate) {
        fetchSection(section, startDate, endDate, filters);
      }
    },
    [fetchSection, startDate, endDate, filters]
  );

  const handleExport = useCallback(
    (kind, section) => {
      if (startDate && endDate) {
        exportCSV(kind, section, startDate, endDate);
      }
    },
    [exportCSV, startDate, endDate]
  );

  // Default to last 7 days on first load
  useEffect(() => {
    const { start, end } = getLastNDaysRange(7);
    setStartDate(start);
    setEndDate(end);
    fetchAnalytics(start, end);
    if (isTenant) fetchDashboard();
    if (isSchoolAdmin) fetchSchoolDashboard();
  }, [
    fetchAnalytics,
    fetchDashboard,
    fetchSchoolDashboard,
    getLastNDaysRange,
    isTenant,
    isSchoolAdmin,
  ]);

  const selectedRangeLabel = useMemo(() => {
    if (startDate && endDate) {
      return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    }
    return "Last 7 days";
  }, [startDate, endDate]);

  const sectionLoading = activeSection === "overview" ? isLoading : isExtendedLoading;
  const sectionError = activeSection === "overview" ? error : extendedError;

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

      <div className="tabs-container analytics-subtabs">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`tab-button ${activeSection === section.key ? "active" : ""}`}
            onClick={() => handleSectionChange(section.key)}
          >
            {section.label}
          </button>
        ))}
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
            <AnalyticsFilters
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              schoolId={schoolId}
              onSchoolIdChange={setSchoolId}
              teacherId={teacherId}
              onTeacherIdChange={setTeacherId}
              onFetch={handleFetch}
              isLoading={sectionLoading}
              onClose={() => setShowFilters(false)}
            />
          </div>
        </div>
      )}

      {sectionError && <div className="error-message">{sectionError}</div>}

      {activeSection === "overview" && (
        <>
          {isTenant && dashboard && <DashboardStats dashboard={dashboard} />}
          {isSchoolAdmin && schoolDashboard && <SchoolDashboardStats dashboard={schoolDashboard} />}

          {!error && analyticsData && analyticsData.length > 0 && <AnalyticsStats stats={stats} />}

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
        </>
      )}

      {activeSection === "conference" && !sectionError && (
        <>
          {isExtendedLoading && (
            <div className="initial-message">Loading conference analytics…</div>
          )}
          {!isExtendedLoading && (
            <ConferenceAnalytics data={conferenceData} onExport={handleExport} />
          )}
        </>
      )}

      {activeSection === "ivr" && !sectionError && (
        <>
          {isExtendedLoading && <div className="initial-message">Loading IVR analytics…</div>}
          {!isExtendedLoading && <IvrAnalytics data={ivrData} onExport={handleExport} />}
        </>
      )}
    </div>
  );
};

export default AnalyticsTab;
