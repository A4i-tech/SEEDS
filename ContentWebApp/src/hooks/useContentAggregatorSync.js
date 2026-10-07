import { useCallback, useEffect, useRef, useState } from "react";
import { contentAggregatorService } from "../services/contentAggregatorService";
import { getRole } from "../utils/authHelpers";
import { USER_ROLES } from "../Constants";

/**
 * Tracks the "sync all" job plus per-course sync jobs via SSE. Reattaches to
 * any job still running on mount (e.g. after a logout/login or page reload).
 */
export const useContentAggregatorSync = (onSettled) => {
  const [runningSources, setRunningSources] = useState({});
  const [progressBySource, setProgressBySource] = useState({});
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
          await contentAggregatorService.streamJob(
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
            const job = await contentAggregatorService.getSyncStatus(job_id);
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

  const syncingAll = Object.values(runningSources).some(Boolean);
  const syncAllProgress = syncingAll
    ? Object.values(progressBySource).reduce(
        (sum, p) => ({ processed: sum.processed + p.processed, total: sum.total + p.total }),
        { processed: 0, total: 0 }
      )
    : null;

  const followAllSyncJob = useCallback(
    (source, job_id, onDone) => {
      setRunningSources((prev) => ({ ...prev, [source]: true }));
      setProgressBySource((prev) => ({ ...prev, [source]: { processed: 0, total: 0 } }));
      followJob(`__all__:${source}`, job_id, {
        setRunning: (running) => setRunningSources((prev) => ({ ...prev, [source]: running })),
        onProgress: (job) =>
          setProgressBySource((prev) => ({ ...prev, [source]: { processed: job.processed, total: job.total_courses } })),
        onDone: (job) => {
          setProgressBySource((prev) => ({ ...prev, [source]: { processed: 0, total: 0 } }));
          onDone(job);
        },
      });
    },
    [followJob]
  );

  const syncAll = useCallback(async () => {
    try {
      const { job_ids } = await contentAggregatorService.syncAll();
      Object.entries(job_ids).forEach(([source, job_id]) =>
        followAllSyncJob(source, job_id, (job) => {
          if (job.status === "completed") {
            alert(`${source} sync complete: ${job.processed}/${job.total_courses} courses processed.`);
            onSettled?.();
          } else {
            alert(`${source} sync failed: ${job.error || "Unknown error"}`);
          }
        })
      );
    } catch (error) {
      alert(`Failed to start sync: ${error.message}`);
    }
  }, [onSettled, followAllSyncJob]);

  const syncCourse = useCallback(
    async (courseId, name, source) => {
      setCourseStates((prev) => ({ ...prev, [courseId]: "running" }));
      try {
        const { job_id } = await contentAggregatorService.syncCourse(courseId, source);
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
    if (getRole() !== USER_ROLES.TENANT) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { jobs } = await contentAggregatorService.getActiveJobs();
        if (cancelled) return;
        jobs.forEach((job) => {
          if (job.scope === "all") {
            followAllSyncJob(job.source, job.job_id, (finished) => {
              if (finished.status === "completed") onSettled?.();
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
        console.error("Failed to check active sync jobs:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onSettled, followJob, followAllSyncJob]);

  return { syncingAll, syncAllProgress, courseStates, syncAll, syncCourse };
};
