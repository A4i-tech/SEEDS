import { useState, useCallback, useMemo } from "react";
import { analyticsService } from "../services/analyticsService";
import { useAuth } from "./useAuth";

export const useConferenceAnalytics = () => {
  const [conferenceData, setConferenceData] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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
    if (!conferenceData || conferenceData.length === 0) {
      return {
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
    }

    const totalConferences = conferenceData.length;

    const formatDuration = (totalSeconds) => {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes}m ${seconds}s`;
    };

    // Calculate durations from action_history
    const durations = conferenceData
      .map((conf) => {
        const history = conf.action_history || [];
        const startAction = history.find(
          (a) => a.action_type === "Conference-Start"
        );
        const endAction = history.find(
          (a) =>
            a.action_type === "Conference-End" ||
            a.action_type === "Conference-Sink"
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
      durations.length > 0
        ? Math.floor(totalDurationSeconds / durations.length)
        : 0;

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const medianDurationSeconds =
      sortedDurations.length > 0
        ? sortedDurations.length % 2 === 0
          ? (sortedDurations[sortedDurations.length / 2 - 1] +
              sortedDurations[sortedDurations.length / 2]) /
            2
          : sortedDurations[Math.floor(sortedDurations.length / 2)]
        : 0;

    // Total raised hand events
    let totalRaisedHands = 0;
    const raisedHandsPerSession = [];

    conferenceData.forEach((conf) => {
      const history = conf.action_history || [];
      const count = history.filter(
        (a) => a.action_type === "Student-RaiseHandStateChange"
      ).length;
      totalRaisedHands += count;
      raisedHandsPerSession.push({
        conferenceId: conf._id,
        teacher:
          teacherMap[conf.teacher_phone_number] || conf.teacher_phone_number,
        count,
      });
    });

    // Conferences by teacher
    const byTeacher = {};
    conferenceData.forEach((conf) => {
      const phone = conf.teacher_phone_number;
      const name = teacherMap[phone] || phone;
      byTeacher[name] = (byTeacher[name] || 0) + 1;
    });
    const conferencesByTeacher = Object.entries(byTeacher)
      .map(([teacher, count]) => ({ teacher, count }))
      .sort((a, b) => b.count - a.count);

    // Conferences by date
    const conferencesByDate = {};
    conferenceData.forEach((conf) => {
      const history = conf.action_history || [];
      const startAction = history.find(
        (a) => a.action_type === "Conference-Start"
      );
      if (startAction) {
        const date = new Date(startAction.timestamp).toLocaleDateString();
        conferencesByDate[date] = (conferencesByDate[date] || 0) + 1;
      }
    });

    // Class size distribution (students only)
    const classSizeCounts = {};
    conferenceData.forEach((conf) => {
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
  }, [conferenceData, teacherMap]);

  return {
    conferenceData,
    teacherMap,
    isLoading,
    error,
    stats,
    fetchConferenceAnalytics,
  };
};
