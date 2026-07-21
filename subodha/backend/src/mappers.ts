"use strict";
import crypto from "crypto";
import type { BlocksResponse, MappedCourse, NormalizedBlock, SubodhaCourse, UrlMap } from "./types";

const CONTENT_TYPES = new Set(["html", "video", "problem", "drag-and-drop-v2", "lti", "discussion"]);

export function isEmpty(blocksResponse: BlocksResponse | undefined): boolean {
  if (!blocksResponse?.blocks) return true;
  return !Object.values(blocksResponse.blocks).some((b) => CONTENT_TYPES.has(b.type));
}

export function rewriteUrls(html: string, urlMap: UrlMap): string {
  if (!html || Object.keys(urlMap).length === 0) return html;
  return Object.entries(urlMap).reduce(
    (out, [original, blobUrl]) => out.split(original).join(blobUrl),
    html
  );
}

// Strip the per-render nonce before hashing, or content hash never stabilizes.
export function stripVolatile(html: string): string {
  if (!html) return html;
  return html.replace(/\sdata-request-token="[^"]*"/g, "");
}

export function normalizeBlocks(blocksResponse: BlocksResponse | undefined, urlMap: UrlMap = {}): NormalizedBlock[] {
  if (!blocksResponse?.blocks) return [];
  return Object.values(blocksResponse.blocks)
    .filter((b) => CONTENT_TYPES.has(b.type))
    .map((b) => ({
      blockId: b.id,
      type: b.type,
      displayName: b.display_name || "",
      html: rewriteUrls(stripVolatile(b.student_view_html || ""), urlMap),
      studentViewData: b.student_view_data ?? null,
      lmsUrl: b.lms_web_url || "",
    }));
}

export function hashBlocks(blocks: NormalizedBlock[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(blocks)).digest("hex");
}

export function mapSubodhaCourseToImported(
  course: SubodhaCourse,
  blocksResponse: BlocksResponse | undefined,
  runId: string,
  urlMap: UrlMap = {}
): MappedCourse {
  const blocks = normalizeBlocks(blocksResponse, urlMap);
  return {
    sourceId: course.id,
    source: "subodha",
    contentHash: hashBlocks(blocks),
    title: course.name,
    org: course.org,
    courseNumber: course.number,
    description: course.short_description,
    language: course.language,
    start: new Date(course.start),
    pacing: course.pacing,
    hidden: course.hidden,
    invitationOnly: course.invitation_only,
    mobileAvailable: course.mobile_available,
    blocks,
    assets: urlMap,
    lastRunId: runId,
    fetchedAt: new Date(),
  };
}
