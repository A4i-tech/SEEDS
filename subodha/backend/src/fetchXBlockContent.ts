"use strict";
import { client as axios } from "./httpClient";
import { withRetry, sleep, mapWithConcurrency } from "./utils";
import type { BlocksResponse, SubodhaBlock } from "./types";

const XBLOCK_DELAY_MS = parseInt(process.env.SUBODHA_XBLOCK_DELAY_MS || "30", 10);
const XBLOCK_CONCURRENCY = parseInt(process.env.SUBODHA_XBLOCK_CONCURRENCY || "10", 10);
const CONTENT_TYPES = new Set(["html", "video", "problem", "drag-and-drop-v2"]);

function extractHtml(raw: string): string {
  const stripped = raw.replace(/<script[^>]+xblock-json-init-args[^>]*>[\s\S]*?<\/script>/i, "");
  const m = stripped.match(/<div[^>]+class="[^"]*xblock[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i);
  return m ? m[1].trim() : stripped.trim();
}

interface VideoData {
  sources: string[];
  streams: string;
  poster: string | null;
  transcriptLanguages: Record<string, string>;
}

function extractVideoData(raw: string): VideoData | null {
  const m = raw.match(/data-metadata='([^']+)'/);
  if (!m) return null;
  try {
    const decoded = m[1]
      .replace(/&#34;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    const meta = JSON.parse(decoded);
    return {
      sources: meta.sources || [],
      streams: meta.streams || "",
      poster: meta.poster || null,
      transcriptLanguages: meta.transcriptLanguages || {},
    };
  } catch (_) {
    return null;
  }
}

export async function enrichBlocksWithContent(
  blocksResponse: BlocksResponse,
  sessionCookie: string
): Promise<BlocksResponse> {
  const blocks = blocksResponse.blocks || {};
  const entries = Object.entries(blocks).filter(
    ([, b]) => CONTENT_TYPES.has(b.type) && b.student_view_url
  );

  await mapWithConcurrency(entries, XBLOCK_CONCURRENCY, async ([, block]: [string, SubodhaBlock]) => {
    try {
      const res = await withRetry(
        () => axios.get(block.student_view_url as string, {
          headers: { Cookie: sessionCookie },
          timeout: 30_000,
        }),
        { label: `xblock ${block.id}` }
      );
      const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);

      if (block.type === "video") {
        block.student_view_data = extractVideoData(raw);
        block.student_view_html = "";
      } else {
        block.student_view_html = extractHtml(raw);
        block.student_view_data = null;
      }
    } catch (err) {
      block.student_view_html = "";
      block.student_view_data = null;
    }
    await sleep(XBLOCK_DELAY_MS);
  });

  return blocksResponse;
}
