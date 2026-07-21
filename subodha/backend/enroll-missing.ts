"use strict";
require("dotenv").config();
import fs from "fs";
import { getSubodhaSession } from "./src/auth";
import { enrollCourse } from "./src/enroll";
import { sleep } from "./src/utils";

const DELAY_MS = 500;

async function main() {
  const { missingCourseIds } = JSON.parse(
    fs.readFileSync("./output/_index/enrollment-check.json", "utf8")
  ) as { missingCourseIds: string[] };

  console.log(`Enrolling in ${missingCourseIds.length} courses...`);
  const session = await getSubodhaSession();

  const results: { enrolled: string[]; failed: Array<{ courseId: string; error: string }> } = {
    enrolled: [],
    failed: [],
  };

  for (let i = 0; i < missingCourseIds.length; i++) {
    const courseId = missingCourseIds[i];
    try {
      const data = await enrollCourse(courseId, session) as { is_active?: boolean };
      results.enrolled.push(courseId);
      console.log(`[${i + 1}/${missingCourseIds.length}] OK ${courseId} (${data.is_active ? "active" : "inactive"})`);
    } catch (err) {
      const e = err as { response?: { data?: unknown }; message: string };
      const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      results.failed.push({ courseId, error: msg });
      console.error(`[${i + 1}/${missingCourseIds.length}] FAIL ${courseId}: ${msg}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done. Enrolled: ${results.enrolled.length}, Failed: ${results.failed.length}`);

  fs.writeFileSync(
    "./output/_index/enroll-missing-result.json",
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        user: process.env.SUBODHA_USERNAME,
        totalAttempted: missingCourseIds.length,
        enrolledCount: results.enrolled.length,
        failedCount: results.failed.length,
        failed: results.failed,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Fatal:", err.response?.data || err.message);
  process.exit(1);
});
