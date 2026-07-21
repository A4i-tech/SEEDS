"use strict";
import { listAllCourses } from "./listCourses";
import { connect as connectMongo } from "./mongo";
import type { CourseDiff } from "./types";

const COLLECTION_NAME = process.env.SUBODHA_COLLECTION_NAME || "subodhaCourses";

export async function getCourseDiff(): Promise<CourseDiff> {
  const [liveCourses, db] = await Promise.all([listAllCourses(), connectMongo()]);

  const storedIds = new Set<string>(await db.collection(COLLECTION_NAME).distinct("sourceId"));
  const liveIds = new Set(liveCourses.map((c) => c.id));

  const newCourses = liveCourses.filter((c) => !storedIds.has(c.id));
  const removedCourseIds = [...storedIds].filter((id) => !liveIds.has(id));

  return {
    totalLive: liveCourses.length,
    totalStored: storedIds.size,
    newCount: newCourses.length,
    removedCount: removedCourseIds.length,
    newCourseIds: newCourses.map((c) => c.id),
    removedCourseIds,
    liveCourses,
  };
}
