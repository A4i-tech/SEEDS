import { useCallback, useEffect, useRef, useState } from "react";
import { subodhaService } from "../services/subodhaService";

const POLL_MS = 1500;

/**
 * Tracks the "sync all" job plus per-course sync jobs kicked off from the
 * content table. Each course row polls its own job id independently.
 */
export const useSubodhaSync = (onSettled) => {
  const [syncingAll, setSyncingAll] = useState(false);
  const [courseStates, setCourseStates] = useState({});
  const timersRef = useRef({});

  const stopPolling = useCallback((key) => {
    if (timersRef.current[key]) {
      clearInterval(timersRef.current[key]);
      delete timersRef.current[key];
    }
  }, []);

  useEffect(() => () => Object.values(timersRef.current).forEach(clearInterval), []);

  const pollJob = useCallback(
    (key, jobId, { onDone, setRunning }) => {
      const check = async () => {
        try {
          const job = await subodhaService.getSyncStatus(jobId);
          if (job.status === "completed" || job.status === "failed") {
            stopPolling(key);
            setRunning(false);
            onDone(job);
          }
        } catch (error) {
          stopPolling(key);
          setRunning(false);
          onDone({ status: "failed", error: error.message });
        }
      };
      timersRef.current[key] = setInterval(check, POLL_MS);
      check();
    },
    [stopPolling]
  );

  const syncAll = useCallback(async () => {
    setSyncingAll(true);
    try {
      const { jobId } = await subodhaService.syncAll();
      pollJob("__all__", jobId, {
        setRunning: setSyncingAll,
        onDone: (job) => {
          if (job.status === "completed") {
            alert(`Subodha sync complete: ${job.result?.processed ?? 0}/${job.result?.totalCourses ?? 0} courses processed.`);
            onSettled?.();
          } else {
            alert(`Subodha sync failed: ${job.error || "Unknown error"}`);
          }
        },
      });
    } catch (error) {
      setSyncingAll(false);
      alert(`Failed to start Subodha sync: ${error.message}`);
    }
  }, [onSettled, pollJob]);

  const syncCourse = useCallback(
    async (courseId, name) => {
      setCourseStates((prev) => ({ ...prev, [courseId]: "running" }));
      try {
        const { jobId } = await subodhaService.syncCourse(courseId);
        pollJob(courseId, jobId, {
          setRunning: (running) =>
            setCourseStates((prev) => ({ ...prev, [courseId]: running ? "running" : prev[courseId] })),
          onDone: (job) => {
            setCourseStates((prev) => ({ ...prev, [courseId]: job.status }));
            if (job.status === "completed") {
              onSettled?.();
            } else {
              alert(`Failed to sync ${name || courseId}: ${job.error || "Unknown error"}`);
            }
          },
        });
      } catch (error) {
        setCourseStates((prev) => ({ ...prev, [courseId]: "failed" }));
        alert(`Failed to start sync for ${name || courseId}: ${error.message}`);
      }
    },
    [onSettled, pollJob]
  );

  return { syncingAll, courseStates, syncAll, syncCourse };
};
