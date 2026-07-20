import { useState, useCallback } from "react";
import { analyticsService } from "../services/analyticsService";
import { useAuth } from "./useAuth";

/**
 * Analytics data hook.
 *
 * The platform backend now returns server-aggregated metrics for two datasets
 * (IVR and conference), so this hook just fetches and stores them — no more
 * client-side stat computation. Both datasets are fetched together for a given
 * date range + optional school/teacher filters.
 */
export const useAnalytics = () => {
  const [ivr, setIvr] = useState(null);
  const [conference, setConference] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ startDate: null, endDate: null });

  const { getAuthHeaders } = useAuth();

  /**
   * Fetch IVR + conference analytics for a date range and optional filters.
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {{schoolId?: string, teacherId?: string}} [filters]
   */
  const fetchAnalytics = useCallback(
    async (startDate, endDate, filters = {}) => {
      if (!startDate || !endDate) {
        setError("Please select both start and end dates");
        return;
      }

      setIsLoading(true);
      setError(null);

      const params = { startDate, endDate, ...filters };
      const headers = getAuthHeaders();

      try {
        const [ivrData, conferenceData] = await Promise.all([
          analyticsService.getIvrAnalytics(params, headers),
          analyticsService.getConferenceAnalytics(params, headers),
        ]);
        setIvr(ivrData);
        setConference(conferenceData);
        setDateRange({ startDate, endDate });
      } catch (err) {
        console.error("Unable to fetch analytics:", err);
        setError(err.message || "Unable to fetch analytics data");
        setIvr(null);
        setConference(null);
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders]
  );

  return {
    ivr,
    conference,
    isLoading,
    error,
    dateRange,
    fetchAnalytics,
    setDateRange,
  };
};
