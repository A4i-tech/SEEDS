import { useState, useCallback, useMemo } from "react";
import { analyticsService } from "../services/analyticsService";
import { useAuth } from "./useAuth";
import { formatDuration, computeMedian } from "../utils/analyticsHelpers";

const emptyStats = {
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
  callsByPhone: {},
};

const computeStats = (data) => {
  if (!data || data.length === 0) return emptyStats;

  const totalCalls = data.length;
  const uniquePhones = new Set(data.map((log) => log.phone_number));
  const uniqueUsers = uniquePhones.size;

  const parseDuration = (durationStr) => {
    if (!durationStr || durationStr === "") return 0;
    const seconds = parseInt(durationStr);
    return !isNaN(seconds) ? seconds : 0;
  };

  const durations = data.map((log) => parseDuration(log.duration)).filter((d) => d > 0);
  const totalDurationSeconds = durations.reduce((sum, d) => sum + d, 0);
  const avgDurationSeconds =
    durations.length > 0 ? Math.floor(totalDurationSeconds / durations.length) : 0;
  const medianDurationSeconds = computeMedian(durations);

  const callsByDate = data.reduce((acc, log) => {
    const date = new Date(log.created_at).toLocaleDateString();
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const stepDepthDistribution = data.reduce((acc, log) => {
    const stepDepth = log.user_actions ? log.user_actions.length : 0;
    acc[stepDepth] = (acc[stepDepth] || 0) + 1;
    return acc;
  }, {});

  const stepDepthData = Object.entries(stepDepthDistribution)
    .sort(([depthA], [depthB]) => parseInt(depthA) - parseInt(depthB))
    .map(([depth, count]) => ({
      depth: parseInt(depth),
      label: `${parseInt(depth)} action${parseInt(depth) !== 1 ? "s" : ""}`,
      count,
    }));

  const contentUsageCounts = {};
  data.forEach((log) => {
    if (log.stream_playback) {
      log.stream_playback.forEach((sp) => {
        const url = sp.stream_url || sp.stream_id || "Unknown";
        const label = url.split("/").pop() || url;
        contentUsageCounts[label] = (contentUsageCounts[label] || 0) + 1;
      });
    }
  });
  const contentUsage = Object.entries(contentUsageCounts)
    .map(([content, count]) => ({ content, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const droppedCalls = data.filter(
    (log) => !log.stopped_at || log.duration === "" || log.duration === "0"
  ).length;
  const dropRate =
    totalCalls > 0 ? ((droppedCalls / totalCalls) * 100).toFixed(1) : "0.0";

  const callsByPhoneCounts = {};
  data.forEach((log) => {
    callsByPhoneCounts[log.phone_number] = (callsByPhoneCounts[log.phone_number] || 0) + 1;
  });

  return {
    totalCalls,
    uniqueUsers,
    avgDuration: formatDuration(avgDurationSeconds),
    medianDuration: formatDuration(medianDurationSeconds),
    totalDuration: formatDuration(totalDurationSeconds),
    callsByDate,
    stepDepthData,
    contentUsage,
    dropRate,
    droppedCalls,
    callsByPhone: callsByPhoneCounts,
  };
};

export const useAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [filterPhone, setFilterPhone] = useState("");

  const { getAuthHeaders } = useAuth();

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

  const stats = useMemo(() => {
    const data = filterPhone
      ? analyticsData.filter((log) => log.phone_number === filterPhone)
      : analyticsData;
    return computeStats(data);
  }, [analyticsData, filterPhone]);

  return {
    analyticsData,
    teacherMap,
    isLoading,
    error,
    dateRange,
    stats,
    fetchAnalytics,
    setDateRange,
    setFilterPhone,
  };
};
