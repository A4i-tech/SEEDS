import { useCallback, useEffect, useRef, useState } from "react";
import { textbookRemediationService } from "../services/textbookRemediationService";

const isRunning = (job) => job.status === "pending" || job.status === "running";

/**
 * Lists textbook remediation jobs and follows every unfinished one over SSE.
 * Reattaches on mount, so a reload mid-run picks the stream back up.
 */
export const useRemediationJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const controllersRef = useRef({});

  const upsert = useCallback((job) => {
    setJobs((previous) => {
      const index = previous.findIndex((j) => j.job_id === job.job_id);
      if (index === -1) return [job, ...previous];
      const next = [...previous];
      next[index] = job;
      return next;
    });
  }, []);

  const follow = useCallback(
    (jobId) => {
      if (controllersRef.current[jobId]) return;
      const controller = new AbortController();
      controllersRef.current[jobId] = controller;

      textbookRemediationService
        .streamJob(jobId, (event) => upsert(event.job), { signal: controller.signal })
        .catch((streamError) => {
          if (controller.signal.aborted) return;
          setError(streamError.message);
        })
        .finally(() => {
          delete controllersRef.current[jobId];
        });
    },
    [upsert]
  );

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await textbookRemediationService.getJobs();
      setJobs(data.jobs);
      data.jobs.filter(isRunning).forEach((job) => follow(job.job_id));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [follow]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => Object.values(controllers).forEach((controller) => controller.abort());
  }, []);

  const upload = useCallback(
    async (file, language) => {
      setIsUploading(true);
      setError(null);
      try {
        const { job_id } = await textbookRemediationService.createJob(file, language);
        upsert(await textbookRemediationService.getJob(job_id));
        follow(job_id);
      } catch (uploadError) {
        setError(uploadError.message);
      } finally {
        setIsUploading(false);
      }
    },
    [follow, upsert]
  );

  return { jobs, isLoading, isUploading, error, upload, reload: load };
};
