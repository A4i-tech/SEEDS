import { useState, useCallback, useMemo } from "react";
import { analyticsService } from "../services/analyticsService";
import { useAuth } from "./useAuth";

export const useAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: null,
    endDate: null,
  });

  const { getAuthHeaders } = useAuth();

  /**
   * Fetch analytics data for a date range
   */
  const fetchAnalytics = useCallback(
    async (startDate, endDate) => {
      if (!startDate || !endDate) {
        setError("Please select both start and end dates");
        return;
      }

      setIsLoading(true);
      setError(null);
      const ac = new AbortController();

      try {
        const response = await analyticsService.getAnalytics(
          startDate,
          endDate,
          getAuthHeaders()
        );

        setAnalyticsData(response.data || []);
        setDateRange({ startDate, endDate });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Error fetching analytics:", err);
          setError(err.message || "Failed to fetch analytics data");
          setAnalyticsData([]);
        }
      } finally {
        setIsLoading(false);
      }

      return () => ac.abort();
    },
    [getAuthHeaders]
  );

  /**
   * Calculate summary statistics from analytics data
   */
  const stats = useMemo(() => {
    if (!analyticsData || analyticsData.length === 0) {
      return {
        totalCalls: 0,
        uniqueUsers: 0,
        avgDuration: "0m 0s",
        totalDuration: "0m 0s",
        callsByDate: {},
      };
    }

    // Total calls
    const totalCalls = analyticsData.length;

    // Unique users (by phone number)
    const uniquePhones = new Set(analyticsData.map((log) => log.phone_number));
    const uniqueUsers = uniquePhones.size;

    // Calculate durations
    const parseDuration = (durationStr) => {
      if (!durationStr || durationStr === "") return 0;

      // Duration is stored as plain number string (seconds)
      const seconds = parseInt(durationStr);
      return !isNaN(seconds) ? seconds : 0;
    };

    const formatDuration = (totalSeconds) => {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}m ${seconds}s`;
    };

    const durations = analyticsData
      .map((log) => parseDuration(log.duration))
      .filter((d) => d > 0);

    const totalDurationSeconds = durations.reduce((sum, d) => sum + d, 0);
    const avgDurationSeconds =
      durations.length > 0
        ? Math.floor(totalDurationSeconds / durations.length)
        : 0;

    const avgDuration = formatDuration(avgDurationSeconds);
    const totalDuration = formatDuration(totalDurationSeconds);

    // Group calls by date
    const callsByDate = analyticsData.reduce((acc, log) => {
      const date = new Date(log.created_at).toLocaleDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    return {
      totalCalls,
      uniqueUsers,
      avgDuration,
      totalDuration,
      callsByDate,
    };
  }, [analyticsData]);

  return {
    analyticsData,
    isLoading,
    error,
    dateRange,
    stats,
    fetchAnalytics,
    setDateRange,
  };
};
