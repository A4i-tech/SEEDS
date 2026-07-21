"use strict";
import { client as axios } from "./httpClient";
import { withRetry } from "./utils";
import type { BlocksResponse } from "./types";

const BASE_URL = process.env.SUBODHA_BASE_URL || "https://subodha-lms.visionempowertrust.org";
const REQUESTED_FIELDS = "display_name,type,student_view_data,student_view_html";

export async function fetchBlocks(courseId: string, sessionCookie: string): Promise<BlocksResponse> {
  const params = new URLSearchParams({
    course_id: courseId,
    depth: "all",
    all_blocks: "true",
    requested_fields: REQUESTED_FIELDS,
  });

  const res = await withRetry(
    () => axios.get<BlocksResponse>(`${BASE_URL}/api/courses/v2/blocks/?${params.toString()}`, {
      headers: { Cookie: sessionCookie },
      timeout: 30_000,
    }),
    { label: `blocks ${courseId}` }
  );

  return res.data;
}
