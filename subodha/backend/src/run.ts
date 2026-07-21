"use strict";
import { randomUUID } from "crypto";
import { getSubodhaSession, clearSessionCache } from "./auth";
import { listAllCourses } from "./listCourses";
import { fetchBlocks } from "./fetchBlocks";
import { enrichBlocksWithContent } from "./fetchXBlockContent";
import { fetchAndStoreAssets } from "./assets";
import { mapSubodhaCourseToImported, isEmpty } from "./mappers";
import { saveCourseDoc, loadCourseDoc } from "./storage";
import { close as closeMongo } from "./mongo";
import { mapWithConcurrency, sleep } from "./utils";
import type { SubodhaCourse, SyncOptions, SyncSummary } from "./types";

const COURSE_CONCURRENCY = parseInt(process.env.SUBODHA_COURSE_CONCURRENCY || "5", 10);
const COURSE_DELAY_MS = parseInt(process.env.SUBODHA_COURSE_DELAY_MS || "0", 10);
const SESSION_REFRESH_EVERY = parseInt(process.env.SUBODHA_SESSION_REFRESH_EVERY || "200", 10);

export interface SessionBox {
  current: string;
}

async function refreshSessionIfDue(sessionBox: SessionBox, count: number): Promise<void> {
  if (count > 0 && count % SESSION_REFRESH_EVERY === 0) {
    clearSessionCache();
    sessionBox.current = await getSubodhaSession();
  }
}

interface ProcessResult {
  status: "saved" | "skipped" | "empty" | "failed";
  courseId: string;
  error?: string;
}

export async function processCourse(
  course: SubodhaCourse,
  sessionBox: SessionBox,
  runId: string,
  dryRun: boolean
): Promise<ProcessResult> {
  const courseId = course.id;
  try {
    const blocksResponse = await fetchBlocks(courseId, sessionBox.current);

    if (isEmpty(blocksResponse)) {
      return { status: "empty", courseId };
    }

    await enrichBlocksWithContent(blocksResponse, sessionBox.current);
    const urlMap = dryRun ? {} : await fetchAndStoreAssets(courseId, blocksResponse, sessionBox.current);
    const mapped = mapSubodhaCourseToImported(course, blocksResponse, runId, urlMap);

    if (dryRun) {
      return { status: "skipped", courseId };
    }

    const existing = await loadCourseDoc(courseId);
    if (existing && (existing as { contentHash?: string }).contentHash === mapped.contentHash) {
      return { status: "skipped", courseId };
    }

    await saveCourseDoc(courseId, mapped);
    return { status: "saved", courseId };
  } catch (err) {
    return { status: "failed", courseId, error: (err as Error).message };
  }
}

export async function runSubodhaSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const { limit = Infinity, dryRun = false, runId = randomUUID(), onProgress } = options;

  const startedAt = new Date().toISOString();
  console.log(`[subodha] run ${runId} started (dryRun=${dryRun})`);

  const sessionBox: SessionBox = { current: await getSubodhaSession() };
  const allCourses = await listAllCourses();
  const toProcess = allCourses.slice(0, limit === Infinity ? allCourses.length : limit);

  console.log(`[subodha] ${toProcess.length} of ${allCourses.length} courses queued`);

  const stats: Record<string, number> = { saved: 0, skipped: 0, empty: 0, failed: 0 };
  const permanentFailures: Array<{ courseId: string; error: string }> = [];
  let processed = 0;

  await mapWithConcurrency(toProcess, COURSE_CONCURRENCY, async (course) => {
    await refreshSessionIfDue(sessionBox, processed);
    const result = await processCourse(course, sessionBox, runId, dryRun);

    stats[result.status] = (stats[result.status] || 0) + 1;
    if (result.status === "failed" && result.error) {
      permanentFailures.push({ courseId: result.courseId, error: result.error });
    }

    processed++;
    onProgress?.({ processed, total: toProcess.length, courseId: result.courseId, status: result.status });

    if (COURSE_DELAY_MS > 0) await sleep(COURSE_DELAY_MS);
  });

  if (!dryRun) await closeMongo();

  const finishedAt = new Date().toISOString();
  const summary: SyncSummary = {
    runId,
    startedAt,
    finishedAt,
    totalCourses: allCourses.length,
    processed,
    stats,
    permanentFailures,
    dlqProcessed: 0,
  };

  console.log(`[subodha] done →`, summary.stats);
  return summary;
}

export async function runSingleCourseSync(
  courseId: string,
  options: { dryRun?: boolean; runId?: string } = {}
): Promise<SyncSummary> {
  const { dryRun = false, runId = randomUUID() } = options;

  const startedAt = new Date().toISOString();
  console.log(`[subodha] single-course run ${runId} started for ${courseId} (dryRun=${dryRun})`);

  const sessionBox: SessionBox = { current: await getSubodhaSession() };
  const allCourses = await listAllCourses();
  const course = allCourses.find((c) => c.id === courseId);

  if (!course) {
    throw new Error(`Course not found on Subodha: ${courseId}`);
  }

  const result = await processCourse(course, sessionBox, runId, dryRun);
  const stats: Record<string, number> = { saved: 0, skipped: 0, empty: 0, failed: 0 };
  stats[result.status] = 1;
  const permanentFailures: Array<{ courseId: string; error: string }> = [];
  if (result.status === "failed" && result.error) {
    permanentFailures.push({ courseId: result.courseId, error: result.error });
  }

  if (!dryRun) await closeMongo();

  const finishedAt = new Date().toISOString();
  return {
    runId,
    startedAt,
    finishedAt,
    totalCourses: 1,
    processed: 1,
    stats,
    permanentFailures,
    dlqProcessed: 0,
  };
}
