import { useCallback, useEffect, useRef, useState } from "react";
import { textbookRemediationService } from "../services/textbookRemediationService";
import { JOB_STATUS } from "../utils/remediationStatus";

const isRunning = (job) => job.status === JOB_STATUS.PENDING || job.status === JOB_STATUS.RUNNING;

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
    async (file, language, translateOptions) => {
      setIsUploading(true);
      setError(null);
      try {
        const { job_id } = await textbookRemediationService.createJob(file, language, translateOptions);
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

  const remove = useCallback(async (jobId) => {
    setError(null);
    try {
      await textbookRemediationService.deleteJob(jobId);
      controllersRef.current[jobId]?.abort();
      delete controllersRef.current[jobId];
      setJobs((previous) => previous.filter((job) => job.job_id !== jobId));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }, []);

  return { jobs, isLoading, isUploading, error, upload, remove, reload: load };
};
