import { useState, useCallback } from "react";
import { analyticsService } from "../services/analyticsService";
import { useAuth } from "./useAuth";

/**
 * Fetches IVR and conference analytics from the dedicated backend endpoints.
 * Mirrors useAnalytics but keeps separate state per section.
 */
export const useExtendedAnalytics = () => {
  const [ivrData, setIvrData] = useState(null);
  const [conferenceData, setConferenceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const { getAuthHeaders } = useAuth();

  const fetchIvrAnalytics = useCallback(
    async (startDate, endDate, filters = {}) => {
      if (!startDate || !endDate) {
        setError("Please select both start and end dates");
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const response = await analyticsService.getIvrAnalytics(
          startDate,
          endDate,
          filters,
          getAuthHeaders()
        );
        setIvrData(response);
      } catch (err) {
        console.error("Unable to fetch IVR analytics:", err);
        setError(err.message || "Unable to fetch IVR analytics");
        setIvrData(null);
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders]
  );

  const fetchConferenceAnalytics = useCallback(
    async (startDate, endDate, filters = {}) => {
      if (!startDate || !endDate) {
        setError("Please select both start and end dates");
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const response = await analyticsService.getConferenceAnalytics(
          startDate,
          endDate,
          filters,
          getAuthHeaders()
        );
        setConferenceData(response);
      } catch (err) {
        console.error("Unable to fetch conference analytics:", err);
        setError(err.message || "Unable to fetch conference analytics");
        setConferenceData(null);
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders]
  );

  const exportCSV = useCallback(
    async (kind, section, startDate, endDate, filters = {}) => {
      try {
        await analyticsService.exportAnalyticsCSV(
          kind,
          section,
          startDate,
          endDate,
          filters,
          getAuthHeaders()
        );
      } catch (err) {
        console.error("CSV export failed:", err);
        setError(err.message || "CSV export failed");
      }
    },
    [getAuthHeaders]
  );

  return {
    ivrData,
    conferenceData,
    isLoading,
    error,
    fetchIvrAnalytics,
    fetchConferenceAnalytics,
    exportCSV,
  };
};
