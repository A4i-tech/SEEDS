"use strict";
require("dotenv").config();
import axios from "axios";
import fs from "fs";
import { getSubodhaSession } from "./src/auth";
import { listAllCourses } from "./src/listCourses";

const BASE_URL = process.env.SUBODHA_BASE_URL || "https://subodha-lms.visionempowertrust.org";

async function main() {
  const session = await getSubodhaSession();

  const res = await axios.get(
    `${BASE_URL}/api/enrollment/v1/enrollment?user=${encodeURIComponent(process.env.SUBODHA_USERNAME || "")}`,
    { headers: { Cookie: session } }
  );

  console.log("Sample enrollment record:", JSON.stringify(res.data[0], null, 2));
  console.log("Total enrollments returned:", res.data.length);

  const enrolledIds = new Set(
    res.data.map((e: { course_details?: { course_id?: string }; course_id?: string }) => e.course_details?.course_id || e.course_id)
  );

  console.log("Fetching full course list...");
  const courses = await listAllCourses();
  console.log("Total courses:", courses.length);

  const missing = courses.filter((c) => !enrolledIds.has(c.id));

  console.log(`Enrolled: ${courses.length - missing.length} / ${courses.length}`);
  console.log(`Missing:  ${missing.length}`);

  fs.writeFileSync(
    "./output/_index/enrollment-check.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        user: process.env.SUBODHA_USERNAME,
        totalCourses: courses.length,
        totalEnrolled: courses.length - missing.length,
        missingCount: missing.length,
        missingCourseIds: missing.map((c) => c.id),
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
