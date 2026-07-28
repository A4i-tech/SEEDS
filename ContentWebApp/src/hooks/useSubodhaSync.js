import { useCallback, useEffect, useRef, useState } from "react";
import { subodhaService } from "../services/subodhaService";

/**
 * Tracks the "sync all" job plus per-course sync jobs via SSE. Reattaches to
 * any job still running on mount (e.g. after a logout/login or page reload).
 */
export const useSubodhaSync = (onSettled) => {
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState(null);
  const [courseStates, setCourseStates] = useState({});
  const controllersRef = useRef({});

  const stopFollowing = useCallback((key) => {
    controllersRef.current[key]?.abort();
    delete controllersRef.current[key];
  }, []);

  useEffect(() => () => Object.values(controllersRef.current).forEach((c) => c.abort()), []);

  const followJob = useCallback(
    (key, jobId, { setRunning, onDone, onProgress }) => {
      const controller = new AbortController();
      controllersRef.current[key] = controller;

      const attach = async () => {
        try {
          await subodhaService.streamJob(
            jobId,
            (event) => {
              if (event.event === "progress") {
                onProgress?.(event.job);
              }
              if (event.event === "done") {
                stopFollowing(key);
                setRunning(false);
                onDone(event.job);
              }
            },
            { signal: controller.signal }
          );
        } catch (error) {
          if (controller.signal.aborted) return;
          try {
            const job = await subodhaService.getSyncStatus(jobId);
            if (job.status === "running") {
              attach();
              return;
            }
            stopFollowing(key);
            setRunning(false);
            onDone(job);
          } catch (statusError) {
            stopFollowing(key);
            setRunning(false);
            onDone({ status: "failed", error: statusError.message });
          }
        }
      };
      attach();
    },
    [stopFollowing]
  );

  const syncAll = useCallback(async () => {
    setSyncingAll(true);
    setSyncAllProgress(null);
    try {
      const { jobId } = await subodhaService.syncAll();
      followJob("__all__", jobId, {
        setRunning: setSyncingAll,
        onProgress: (job) => setSyncAllProgress({ processed: job.processed, total: job.totalCourses }),
        onDone: (job) => {
          setSyncAllProgress(null);
          if (job.status === "completed") {
            alert(`Subodha sync complete: ${job.processed ?? 0}/${job.totalCourses ?? 0} courses processed.`);
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
  }, [onSettled, followJob]);

  const syncCourse = useCallback(
    async (courseId, name) => {
      setCourseStates((prev) => ({ ...prev, [courseId]: "running" }));
      try {
        const { jobId } = await subodhaService.syncCourse(courseId);
        followJob(courseId, jobId, {
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
    [onSettled, followJob]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { jobs } = await subodhaService.getActiveJobs();
        if (cancelled) return;
        jobs.forEach((job) => {
          if (job.scope === "all") {
            setSyncingAll(true);
            setSyncAllProgress({ processed: job.processed, total: job.totalCourses });
            followJob("__all__", job.jobId, {
              setRunning: setSyncingAll,
              onProgress: (updated) => setSyncAllProgress({ processed: updated.processed, total: updated.totalCourses }),
              onDone: (finished) => {
                setSyncAllProgress(null);
                if (finished.status === "completed") onSettled?.();
              },
            });
          } else if (job.scope === "course" && job.courseId) {
            setCourseStates((prev) => ({ ...prev, [job.courseId]: "running" }));
            followJob(job.courseId, job.jobId, {
              setRunning: (running) =>
                setCourseStates((prev) => ({ ...prev, [job.courseId]: running ? "running" : prev[job.courseId] })),
              onDone: (finished) => {
                setCourseStates((prev) => ({ ...prev, [job.courseId]: finished.status }));
                if (finished.status === "completed") onSettled?.();
              },
            });
          }
        });
      } catch (error) {
        console.error("Failed to check active Subodha sync jobs:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { syncingAll, syncAllProgress, courseStates, syncAll, syncCourse };
};
