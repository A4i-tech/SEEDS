"use strict";
import { client as axios } from "./httpClient";
import { sleep, withRetry } from "./utils";
import { CoursesPageResponseSchema } from "./types";
import type { SubodhaCourse } from "./types";


const BASE_URL = process.env.SUBODHA_BASE_URL || "https://subodha-lms.visionempowertrust.org";
const PAGE_SIZE = parseInt(process.env.SUBODHA_PAGE_SIZE || "100", 10);
const PAGE_DELAY_MS = parseInt(process.env.SUBODHA_PAGE_DELAY_MS || "300", 10);

export async function listAllCourses(): Promise<SubodhaCourse[]> {
  const courses: SubodhaCourse[] = [];
  let url: string | null = `${BASE_URL}/api/courses/v1/courses/?page=1&page_size=${PAGE_SIZE}`;
  let page = 1;

  while (url) {
    const currentUrl: string = url;
    const res = await withRetry(
      () => axios.get(currentUrl, { timeout: 30_000 }),
      { label: `courses page ${page}` }
    );

    const { results, pagination } = CoursesPageResponseSchema.parse(res.data);
    courses.push(...results);
    url = pagination.next;
    page++;

    if (url) await sleep(PAGE_DELAY_MS);
  }

  return courses;
}
