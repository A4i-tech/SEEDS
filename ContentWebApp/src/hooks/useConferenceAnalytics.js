import { useState, useCallback, useMemo } from "react";
import { analyticsService } from "../services/analyticsService";
import { useAuth } from "./useAuth";
import { formatDuration, computeMedian } from "../utils/analyticsHelpers";

const emptyStats = {
  totalConferences: 0,
  avgDuration: "0m 0s",
  medianDuration: "0m 0s",
  totalDuration: "0m 0s",
  totalRaisedHands: 0,
  conferencesByTeacher: [],
  conferencesByDate: {},
  classSizeDistribution: [],
  raisedHandsPerSession: [],
};

const computeStats = (data, teacherMap) => {
  if (!data || data.length === 0) return emptyStats;

  const totalConferences = data.length;

  // Calculate durations from action_history
  const durations = data
    .map((conf) => {
      const history = conf.action_history || [];
      const startAction = history.find((a) => a.action_type === "Conference-Start");
      const endAction = history.find(
        (a) => a.action_type === "Conference-End" || a.action_type === "Conference-Sink"
      );
      if (!startAction || !endAction) return null;

      const startTime = new Date(startAction.timestamp).getTime();
      const endTime = new Date(endAction.timestamp).getTime();
      if (isNaN(startTime) || isNaN(endTime)) return null;

      return (endTime - startTime) / 1000;
    })
    .filter((d) => d !== null && d > 0);

  const totalDurationSeconds = durations.reduce((sum, d) => sum + d, 0);
  const avgDurationSeconds =
    durations.length > 0 ? Math.floor(totalDurationSeconds / durations.length) : 0;
  const medianDurationSeconds = computeMedian(durations);

  // Total raised hand events
  let totalRaisedHands = 0;
  const raisedHandsPerSession = [];

  data.forEach((conf) => {
    const history = conf.action_history || [];
    const count = history.filter(
      (a) => a.action_type === "Student-RaiseHandStateChange"
    ).length;
    totalRaisedHands += count;
    raisedHandsPerSession.push({
      conferenceId: conf._id,
      teacher: teacherMap[conf.teacher_phone_number] || conf.teacher_phone_number,
      count,
    });
  });

  // Conferences by teacher
  const byTeacher = {};
  data.forEach((conf) => {
    const phone = conf.teacher_phone_number;
    const name = teacherMap[phone] || phone;
    byTeacher[name] = (byTeacher[name] || 0) + 1;
  });
  const conferencesByTeacher = Object.entries(byTeacher)
    .map(([teacher, count]) => ({ teacher, count }))
    .sort((a, b) => b.count - a.count);

  // Conferences by date
  const conferencesByDate = {};
  data.forEach((conf) => {
    const history = conf.action_history || [];
    const startAction = history.find((a) => a.action_type === "Conference-Start");
    if (startAction) {
      const date = new Date(startAction.timestamp).toLocaleDateString();
      conferencesByDate[date] = (conferencesByDate[date] || 0) + 1;
    }
  });

  // Class size distribution (students only)
  const classSizeCounts = {};
  data.forEach((conf) => {
    const participants = conf.participants || {};
    const studentCount = Object.values(participants).filter(
      (p) => p.role === "Student"
    ).length;
    classSizeCounts[studentCount] = (classSizeCounts[studentCount] || 0) + 1;
  });
  const classSizeDistribution = Object.entries(classSizeCounts)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([size, count]) => ({
      size: parseInt(size),
      label: `${size} student${parseInt(size) !== 1 ? "s" : ""}`,
      count,
    }));

  return {
    totalConferences,
    avgDuration: formatDuration(avgDurationSeconds),
    medianDuration: formatDuration(medianDurationSeconds),
    totalDuration: formatDuration(totalDurationSeconds),
    totalRaisedHands,
    conferencesByTeacher,
    conferencesByDate,
    classSizeDistribution,
    raisedHandsPerSession,
  };
};

export const useConferenceAnalytics = () => {
  const [conferenceData, setConferenceData] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterPhone, setFilterPhone] = useState("");

  const { getAuthHeaders } = useAuth();

  const fetchConferenceAnalytics = useCallback(
    async (startDate, endDate) => {
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
          getAuthHeaders()
        );

        setConferenceData(response.data || []);
        setTeacherMap(response.teacherMap || {});
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Unable to fetch conference analytics:", err);
          setError(err.message || "Unable to fetch conference analytics data");
          setConferenceData([]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders]
  );

  const stats = useMemo(() => {
    const data = filterPhone
      ? conferenceData.filter((conf) => conf.teacher_phone_number === filterPhone)
      : conferenceData;
    return computeStats(data, teacherMap);
  }, [conferenceData, teacherMap, filterPhone]);

  return {
    conferenceData,
    teacherMap,
    isLoading,
    error,
    stats,
    fetchConferenceAnalytics,
    setFilterPhone,
  };
};
