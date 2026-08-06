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
    (key, job_id, { setRunning, onDone, onProgress }) => {
      const controller = new AbortController();
      controllersRef.current[key] = controller;

      const attach = async () => {
        try {
          await subodhaService.streamJob(
            job_id,
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
            const job = await subodhaService.getSyncStatus(job_id);
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
      const { job_id } = await subodhaService.syncAll();
      followJob("__all__", job_id, {
        setRunning: setSyncingAll,
        onProgress: (job) => setSyncAllProgress({ processed: job.processed, total: job.total_courses }),
        onDone: (job) => {
          setSyncAllProgress(null);
          if (job.status === "completed") {
            alert(`Subodha sync complete: ${job.processed ?? 0}/${job.total_courses ?? 0} courses processed.`);
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
        const { job_id } = await subodhaService.syncCourse(courseId);
        followJob(courseId, job_id, {
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
            setSyncAllProgress({ processed: job.processed, total: job.total_courses });
            followJob("__all__", job.job_id, {
              setRunning: setSyncingAll,
              onProgress: (updated) => setSyncAllProgress({ processed: updated.processed, total: updated.total_courses }),
              onDone: (finished) => {
                setSyncAllProgress(null);
                if (finished.status === "completed") onSettled?.();
              },
            });
          } else if (job.scope === "course" && job.course_id) {
            setCourseStates((prev) => ({ ...prev, [job.course_id]: "running" }));
            followJob(job.course_id, job.job_id, {
              setRunning: (running) =>
                setCourseStates((prev) => ({ ...prev, [job.course_id]: running ? "running" : prev[job.course_id] })),
              onDone: (finished) => {
                setCourseStates((prev) => ({ ...prev, [job.course_id]: finished.status }));
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
