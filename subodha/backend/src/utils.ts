"use strict";
import type { RetryOptions } from "./types";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const NETWORK_ERRORS = new Set(["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]);

interface RetryableError extends Error {
  code?: string;
  cause?: { code?: string };
  response?: { status?: number; headers?: Record<string, string> };
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 5, baseDelay = 5000, label = "" } = options;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as RetryableError;
      const status = e?.response?.status;
      const retryAfter = parseInt(e?.response?.headers?.["retry-after"] || "0", 10);
      const isNetworkErr = NETWORK_ERRORS.has(e?.code || "") || NETWORK_ERRORS.has(e?.cause?.code || "");

      if (status === 429 || status === 503 || isNetworkErr) {
        const wait = retryAfter > 0 ? retryAfter * 1000 : baseDelay * attempt;
        console.warn(`[retry] ${label} ${e?.code || status} — waiting ${wait / 1000}s (attempt ${attempt}/${retries})`);
        await sleep(wait);
        continue;
      }

      throw err;
    }
  }
  throw new Error(`${label} failed after ${retries} retries`);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
