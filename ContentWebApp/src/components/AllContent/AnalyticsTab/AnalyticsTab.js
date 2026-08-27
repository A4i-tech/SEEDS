import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAnalytics } from "../../../hooks/useAnalytics";
import { useDashboard } from "../../../hooks/useDashboard";
import { getRole, getAuthHeaders } from "../../../utils/authHelpers";
import { schoolService } from "../../../services/schoolService";
import { teacherService } from "../../../services/teacherService";
import DateRangeSelector from "./DateRangeSelector";
import IvrAnalytics from "./IvrAnalytics";
import ConferenceAnalytics from "./ConferenceAnalytics";
import DashboardStats from "./DashboardStats";
import SchoolDashboardStats from "./SchoolDashboardStats";
import StatCardsSkeleton from "../shared/StatCardsSkeleton";
import "./css/AnalyticsTab.css";
import "../shared/cards.css";

const AnalyticsTab = () => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [subTab, setSubTab] = useState("ivr");

  // Filter selections
  const [schoolId, setSchoolId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [schools, setSchools] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [filterError, setFilterError] = useState(null);

  const { ivr, conference, isLoading, error, dateRange, fetchAnalytics } = useAnalytics();
  const {
    dashboard,
    schoolDashboard,
    isLoading: isDashboardLoading,
    fetchDashboard,
    fetchSchoolDashboard,
  } = useDashboard();
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
      fetchAnalytics(start, end, {
        schoolId: schoolId || undefined,
        teacherId: teacherId || undefined,
      });
    },
    [fetchAnalytics, schoolId, teacherId]
  );

  // Default to last 7 days on first load. Run-once semantics come from a stable
  // init ref, not a disabled dependency check, so real dep changes stay honest.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const { start, end } = getLastNDaysRange(7);
    setStartDate(start);
    setEndDate(end);
    fetchAnalytics(start, end);
    if (isTenant) fetchDashboard();
    if (isSchoolAdmin) fetchSchoolDashboard();
  }, [
    getLastNDaysRange,
    fetchAnalytics,
    fetchDashboard,
    fetchSchoolDashboard,
    isTenant,
    isSchoolAdmin,
  ]);

  // Load filter option lists. Tenants list all schools; only school_admins can
  // hit GET /school/teachers — calling it as a tenant 403s, and apiFetch treats
  // any 403 as session-expired and force-logs the user out. So the teacher fetch
  // is gated on the role that owns that route.
  useEffect(() => {
    let cancelled = false;
    const failed = [];

    if (isTenant) {
      schoolService
        .getSchools()
        .then((data) => !cancelled && setSchools(Array.isArray(data) ? data : data?.data || []))
        .catch((e) => {
          console.error("[AnalyticsTab] unable to load schools", { message: e?.message });
          if (!cancelled) {
            failed.push("schools");
            setFilterError(`Could not load filter options (${failed.join(", ")}).`);
          }
        });
    }

    if (isSchoolAdmin) {
      teacherService
        .getTeachers(getAuthHeaders())
        .then((data) => !cancelled && setTeachers(Array.isArray(data) ? data : []))
        .catch((e) => {
          console.error("[AnalyticsTab] unable to load teachers", { message: e?.message });
          if (!cancelled) {
            failed.push("teachers");
            setFilterError(`Could not load filter options (${failed.join(", ")}).`);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [isTenant, isSchoolAdmin]);

  const selectedRangeLabel = useMemo(() => {
    if (startDate && endDate) {
      return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    }
    return "Last 7 days";
  }, [startDate, endDate]);

  // A fetch has completed at least once when the hook records a date range.
  const hasFetched = Boolean(dateRange?.startDate && dateRange?.endDate);
  const activeData = subTab === "ivr" ? ivr : conference;
  const activeCount =
    subTab === "ivr"
      ? activeData?.totals?.totalCalls ?? 0
      : activeData?.totals?.totalConferences ?? 0;

  // Drive messaging from the active request state, not object truthiness.
  // Precedence: loading > populated > empty (only after a completed fetch).
  const showLoading = isLoading && !activeData;
  const showData = !isLoading && activeData && activeCount > 0;
  const showEmpty = !isLoading && hasFetched && activeCount === 0;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Analytics Dashboard</div>
          <div className="card-description">
            Conference &amp; IVR usage metrics for your {isTenant ? "tenant" : "school"}
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

            {filterError && (
              <div className="filter-warning" role="status">
                {filterError}
              </div>
            )}

            {isTenant && (
              <div className="filter-field">
                <label className="filter-label" htmlFor="analytics-school">
                  School
                </label>
                <select
                  id="analytics-school"
                  className="filter-select"
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                >
                  <option value="">All schools</option>
                  {schools.map((s) => (
                    <option key={s._id || s.id} value={s._id || s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isSchoolAdmin && (
              <div className="filter-field">
                <label className="filter-label" htmlFor="analytics-teacher">
                  Teacher
                </label>
                <select
                  id="analytics-teacher"
                  className="filter-select"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                >
                  <option value="">All teachers</option>
                  {teachers.map((t) => (
                    <option key={t._id || t.id} value={t._id || t.id}>
                      {t.name}
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

      {isTenant && isDashboardLoading && !dashboard && <StatCardsSkeleton count={4} />}
      {isTenant && dashboard && <DashboardStats dashboard={dashboard} />}
      {isSchoolAdmin && isDashboardLoading && !schoolDashboard && <StatCardsSkeleton count={3} />}
      {isSchoolAdmin && schoolDashboard && <SchoolDashboardStats dashboard={schoolDashboard} />}

      <div className="analytics-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "ivr"}
          className={`subtab-button ${subTab === "ivr" ? "active" : ""}`}
          onClick={() => setSubTab("ivr")}
        >
          IVR
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "conference"}
          className={`subtab-button ${subTab === "conference" ? "active" : ""}`}
          onClick={() => setSubTab("conference")}
        >
          Conference
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {!error && showLoading && <div className="initial-message">Loading analytics…</div>}

      {!error && showData && (
        <>
          {subTab === "ivr" && <IvrAnalytics data={ivr} />}
          {subTab === "conference" && <ConferenceAnalytics data={conference} />}
        </>
      )}

      {!error && showEmpty && (
        <div className="no-data-message">
          No {subTab === "ivr" ? "IVR call" : "conference"} data for the selected filters. Try a
          different date range.
        </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
