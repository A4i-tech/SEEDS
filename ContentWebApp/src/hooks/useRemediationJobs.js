import { useCallback, useEffect, useRef, useState } from "react";
import { textbookRemediationService } from "../services/textbookRemediationService";
import { JOB_STATUS } from "../utils/remediationStatus";

const isRunning = (job) => job.status === JOB_STATUS.PENDING || job.status === JOB_STATUS.RUNNING;

export const useRemediationJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [books, setBooks] = useState([]);
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

  const apply = useCallback(
    (data) => {
      setJobs(data.jobs);
      setBooks(data.books);
      data.jobs.filter(isRunning).forEach((job) => follow(job.job_id));
    },
    [follow]
  );

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      apply(await textbookRemediationService.getJobs());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [apply]);

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

  const uploadBook = useCallback(
    async (files, bookOptions) => {
      setIsUploading(true);
      setError(null);
      try {
        await textbookRemediationService.createBook(files, bookOptions);
        apply(await textbookRemediationService.getJobs());
        return true;
      } catch (uploadError) {
        setError(uploadError.message);
        return false;
      } finally {
        setIsUploading(false);
      }
    },
    [apply]
  );

  const stopFollowing = useCallback((jobId) => {
    controllersRef.current[jobId]?.abort();
    delete controllersRef.current[jobId];
  }, []);

  const remove = useCallback(
    async (jobId) => {
      setError(null);
      try {
        await textbookRemediationService.deleteJob(jobId);
        stopFollowing(jobId);
        setJobs((previous) => previous.filter((job) => job.job_id !== jobId));
        setBooks((previous) =>
          previous.map((book) => ({ ...book, job_ids: book.job_ids.filter((id) => id !== jobId) }))
        );
      } catch (deleteError) {
        setError(deleteError.message);
      }
    },
    [stopFollowing]
  );

  const reorderBook = useCallback(async (bookId, jobIds) => {
    setError(null);
    try {
      const updated = await textbookRemediationService.reorderBook(bookId, jobIds);
      setBooks((previous) => previous.map((book) => (book.book_id === bookId ? updated : book)));
      return true;
    } catch (reorderError) {
      setError(reorderError.message);
      return false;
    }
  }, []);

  const removeBook = useCallback(
    async (bookId) => {
      setError(null);
      try {
        await textbookRemediationService.deleteBook(bookId);
        books.find((book) => book.book_id === bookId).job_ids.forEach(stopFollowing);
        setJobs((previous) => previous.filter((job) => job.book_id !== bookId));
        setBooks((previous) => previous.filter((book) => book.book_id !== bookId));
      } catch (deleteError) {
        setError(deleteError.message);
      }
    },
    [books, stopFollowing]
  );

  return {
    jobs,
    books,
    isLoading,
    isUploading,
    error,
    upload,
    uploadBook,
    remove,
    removeBook,
    reorderBook,
    reload: load,
  };
};
