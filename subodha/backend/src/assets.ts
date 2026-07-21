"use strict";
import { client as axios } from "./httpClient";
import path from "path";
import { uploadAsset } from "./blobStorage";
import { mapWithConcurrency } from "./utils";
import type { BlocksResponse, SubodhaBlock, UrlMap } from "./types";

const BASE_URL = process.env.SUBODHA_BASE_URL || "https://subodha-lms.visionempowertrust.org";
const ASSET_CONCURRENCY = parseInt(process.env.SUBODHA_ASSET_CONCURRENCY || "10", 10);

const ASSET_URL_PATTERN = /\/asset-v1:[^"'\s)>,;&]+/g;

const fetchCache = new Map<string, Buffer>();

function extractAssetUrls(blocks: SubodhaBlock[]): string[] {
  const urls = new Set<string>();
  for (const block of blocks) {
    const html = block.student_view_html || "";
    const matches = html.match(ASSET_URL_PATTERN) || [];
    matches.forEach((url) => urls.add(url));
  }
  return [...urls];
}

function fileNameFromAssetUrl(assetUrl: string): string {
  const match = assetUrl.match(/block@(.+)$/);
  return match ? decodeURIComponent(match[1]) : path.basename(assetUrl);
}

export async function fetchAndStoreAssets(
  courseId: string,
  blocksResponse: BlocksResponse,
  sessionCookie: string
): Promise<UrlMap> {
  const allBlocks = Object.values(blocksResponse.blocks || {});
  const assetUrls = extractAssetUrls(allBlocks);

  if (assetUrls.length === 0) return {};

  const safeCourseId = courseId.replace(/[:/+]/g, "_");
  const urlMap: UrlMap = {};
  const stats = { saved: 0, failed: 0 };

  await mapWithConcurrency(assetUrls, ASSET_CONCURRENCY, async (relativeUrl) => {
    const fileName = fileNameFromAssetUrl(relativeUrl);
    const blobPath = `courses/${safeCourseId}/assets/${fileName}`;

    try {
      let buf = fetchCache.get(relativeUrl);
      if (!buf) {
        const res = await axios.get(`${BASE_URL}${relativeUrl}`, {
          headers: { Cookie: sessionCookie },
          responseType: "arraybuffer",
          timeout: 30_000,
        });
        buf = Buffer.from(res.data);
        fetchCache.set(relativeUrl, buf);
      }

      const blobUrl = await uploadAsset(blobPath, buf, fileName);
      urlMap[relativeUrl] = blobUrl;
      stats.saved++;
    } catch (err) {
      console.warn(`[assets] SKIP ${relativeUrl}: ${(err as Error).message}`);
      stats.failed++;
    }
  });

  console.log(`[assets] ${courseId}: ${stats.saved} saved, ${stats.failed} failed`);
  return urlMap;
}
