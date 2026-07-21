"use strict";
require("dotenv").config();
import express, { Request, Response } from "express";
import { runSubodhaSync, runSingleCourseSync } from "./run";
import { getCourseDiff } from "./diff";
import { getContentList } from "./contentList";
import { createJob, updateJob, getJob, listJobs } from "./jobs";
import { client as axios } from "./httpClient";
import type { Job, SyncProgress } from "./types";
import { asyncHandler, errorHandler, errorMessage } from "./errors";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.SUBODHA_SERVER_PORT || "4001", 10);
const WEBHOOK_MIN_INTERVAL_MS = parseInt(process.env.SUBODHA_WEBHOOK_MIN_INTERVAL_MS || "10000", 10);

let lastWebhookAt = 0;

async function postWebhook(webhookUrl: string | undefined, payload: Record<string, unknown>): Promise<void> {
  if (!webhookUrl) return;
  const now = Date.now();
  if (now - lastWebhookAt < WEBHOOK_MIN_INTERVAL_MS && payload.event === "progress") return;
  lastWebhookAt = now;
  try {
    await axios.post(webhookUrl, payload, { timeout: 10_000 });
  } catch (err) {
    console.warn(`[subodha-server] webhook POST failed: ${errorMessage(err)}`);
  }
}

app.get(
  "/diff",
  asyncHandler(async (_req: Request, res: Response) => {
    const diff = await getCourseDiff();
    res.json(diff);
  })
);

app.post("/sync", async (req: Request, res: Response) => {
  const { onlyNew = false, dryRun = false, webhookUrl, limit } = req.body || {};

  const job: Job = createJob();
  res.status(202).json({ jobId: job.id });

  (async () => {
    try {
      let courseIds: string[] | undefined;
      let diff = null;

      if (onlyNew) {
        diff = await getCourseDiff();
        courseIds = diff.newCourseIds;
        updateJob(job.id, { diff });
        await postWebhook(webhookUrl, { event: "diffing", jobId: job.id, ...diff });
      }

      const syncOptions = {
        limit: limit ?? (courseIds ? courseIds.length : Infinity),
        dryRun,
        runId: job.id,
        onProgress: (progress: SyncProgress) => {
          updateJob(job.id, { progress });
          void postWebhook(webhookUrl, { event: "progress", jobId: job.id, ...progress });
        },
      };

      const result = await runSubodhaSync(syncOptions);
      updateJob(job.id, {
        status: "completed",
        finishedAt: new Date().toISOString(),
        result,
      });
      await postWebhook(webhookUrl, { event: "completed", jobId: job.id, ...result });
    } catch (err) {
      const message = (err as Error).message;
      updateJob(job.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: message,
      });
      await postWebhook(webhookUrl, { event: "failed", jobId: job.id, error: message });
    }
  })();
});

app.get("/courses", async (_req: Request, res: Response) => {
  try {
    const content = await getContentList();
    res.json({ courses: content });
  } catch (err) {
    console.error("[subodha-server] /courses failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/sync/course/:courseId", async (req: Request, res: Response) => {
  const { courseId } = req.params;
  const { dryRun = false, webhookUrl } = req.body || {};

  const job: Job = createJob();
  res.status(202).json({ jobId: job.id });

  (async () => {
    try {
      const result = await runSingleCourseSync(courseId, { dryRun, runId: job.id });
      updateJob(job.id, {
        status: "completed",
        finishedAt: new Date().toISOString(),
        result,
      });
      await postWebhook(webhookUrl, { event: "completed", jobId: job.id, courseId, ...result });
    } catch (err) {
      const message = (err as Error).message;
      updateJob(job.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: message,
      });
      await postWebhook(webhookUrl, { event: "failed", jobId: job.id, courseId, error: message });
    }
  })();
});

app.get("/sync/status/:jobId", (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

app.get("/sync/jobs", (_req: Request, res: Response) => {
  res.json(listJobs());
});

app.listen(PORT, () => {
  console.log(`[subodha-server] listening on :${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[subodha-server] shutting down");
  process.exit(0);
});
