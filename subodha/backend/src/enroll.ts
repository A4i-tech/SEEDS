"use strict";
import { client as axios } from "./httpClient";
import { withRetry } from "./utils";

const BASE_URL = process.env.SUBODHA_BASE_URL || "https://subodha-lms.visionempowertrust.org";

function extractCsrf(cookieStr: string): string {
  const m = cookieStr.match(/csrftoken=([^;]+)/);
  return m ? m[1] : "";
}

export async function enrollCourse(courseId: string, sessionCookie: string): Promise<unknown> {
  const res = await withRetry(
    () =>
      axios.post(
        `${BASE_URL}/api/enrollment/v1/enrollment`,
        { course_details: { course_id: courseId }, mode: "audit" },
        {
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
            "X-CSRFToken": extractCsrf(sessionCookie),
            Referer: BASE_URL,
          },
          timeout: 30_000,
        }
      ),
    { label: `enroll ${courseId}` }
  );
  return res.data;
}
