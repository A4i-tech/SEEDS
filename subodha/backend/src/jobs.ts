"use strict";
import { randomUUID } from "crypto";
import type { Job } from "./types";

const jobs = new Map<string, Job>();
const MAX_JOBS = 50;

export function createJob(): Job {
  const id = randomUUID();
  const job: Job = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    diff: null,
    progress: null,
    result: null,
    error: null,
  };
  jobs.set(id, job);

  if (jobs.size > MAX_JOBS) {
    const oldestKey = jobs.keys().next().value;
    if (oldestKey) jobs.delete(oldestKey);
  }

  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) || null;
}

export function listJobs(): Job[] {
  return [...jobs.values()].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
