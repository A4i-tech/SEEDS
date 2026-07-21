"use strict";
import { connect } from "./mongo";
import type { MappedCourse } from "./types";

export const COLLECTION_NAME = process.env.SUBODHA_COLLECTION_NAME || "subodhaCourses";

export async function saveCourseDoc(sourceId: string, doc: MappedCourse) {
  const db = await connect();
  return db.collection(COLLECTION_NAME).updateOne(
    { sourceId },
    { $set: doc },
    { upsert: true }
  );
}

export async function loadCourseDoc(sourceId: string) {
  const db = await connect();
  return db.collection(COLLECTION_NAME).findOne({ sourceId });
}
