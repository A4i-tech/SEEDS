import { useState, useCallback, useMemo } from "react";
import { analyticsService } from "../services/analyticsService";
import { useAuth } from "./useAuth";

export const useAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
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
        const response = await analyticsService.getAnalytics(startDate, endDate, getAuthHeaders());

        setAnalyticsData(response.data || []);
        setTeacherMap(response.teacherMap || {});
        setDateRange({ startDate, endDate });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Unable to fetch analytics:", err);
          setError(err.message || "Unable to fetch analytics data");
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

    const durations = analyticsData.map((log) => parseDuration(log.duration)).filter((d) => d > 0);

    const totalDurationSeconds = durations.reduce((sum, d) => sum + d, 0);
    const avgDurationSeconds =
      durations.length > 0 ? Math.floor(totalDurationSeconds / durations.length) : 0;

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const medianDurationSeconds =
      sortedDurations.length > 0
        ? sortedDurations.length % 2 === 0
          ? (sortedDurations[sortedDurations.length / 2 - 1] +
              sortedDurations[sortedDurations.length / 2]) /
            2
          : sortedDurations[Math.floor(sortedDurations.length / 2)]
        : 0;

    const avgDuration = formatDuration(avgDurationSeconds);
    const medianDuration = formatDuration(medianDurationSeconds);
    const totalDuration = formatDuration(totalDurationSeconds);

    // Group calls by date
    const callsByDate = analyticsData.reduce((acc, log) => {
      const date = new Date(log.created_at).toLocaleDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    // Calculate step depth distribution
    // Step depth = number of user actions (key presses) in a call
    const stepDepthDistribution = analyticsData.reduce((acc, log) => {
      const stepDepth = log.user_actions ? log.user_actions.length : 0;
      acc[stepDepth] = (acc[stepDepth] || 0) + 1;
      return acc;
    }, {});

    // Convert step depth distribution to sorted array for charting
    const stepDepthData = Object.entries(stepDepthDistribution)
      .sort(([depthA], [depthB]) => parseInt(depthA) - parseInt(depthB))
      .map(([depth, count]) => ({
        depth: parseInt(depth),
        label: `${parseInt(depth)} action${parseInt(depth) !== 1 ? "s" : ""}`,
        count,
      }));

    // Content usage frequency from stream_playback
    const contentUsageCounts = {};
    analyticsData.forEach((log) => {
      if (log.stream_playback) {
        log.stream_playback.forEach((sp) => {
          const url = sp.stream_url || sp.stream_id || "Unknown";
          // Extract filename or last path segment for readability
          const label = url.split("/").pop() || url;
          contentUsageCounts[label] = (contentUsageCounts[label] || 0) + 1;
        });
      }
    });
    const contentUsage = Object.entries(contentUsageCounts)
      .map(([content, count]) => ({ content, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Call drop/failure rate
    const droppedCalls = analyticsData.filter(
      (log) => !log.stopped_at || log.duration === "" || log.duration === "0"
    ).length;
    const dropRate =
      totalCalls > 0 ? ((droppedCalls / totalCalls) * 100).toFixed(1) : "0.0";

    // Calls by teacher
    const callsByTeacherCounts = {};
    analyticsData.forEach((log) => {
      const phone = log.phone_number;
      callsByTeacherCounts[phone] = (callsByTeacherCounts[phone] || 0) + 1;
    });

    return {
      totalCalls,
      uniqueUsers,
      avgDuration,
      medianDuration,
      totalDuration,
      callsByDate,
      stepDepthData,
      contentUsage,
      dropRate,
      droppedCalls,
      callsByTeacher: callsByTeacherCounts,
    };
  }, [analyticsData]);

  return {
    analyticsData,
    teacherMap,
    isLoading,
    error,
    dateRange,
    stats,
    fetchAnalytics,
    setDateRange,
  };
};
