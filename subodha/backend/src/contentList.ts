"use strict";
import { connect as connectMongo } from "./mongo";
import { COLLECTION_NAME } from "./storage";
import type { MappedCourse, ContentListItem } from "./types";

const PROJECTION = {
  sourceId: 1,
  title: 1,
  org: 1,
  courseNumber: 1,
  language: 1,
  hidden: 1,
  fetchedAt: 1,
  lastRunId: 1,
} as const;

export async function getContentList(): Promise<ContentListItem[]> {
  const db = await connectMongo();

  const storedDocs = await db
    .collection<MappedCourse>(COLLECTION_NAME)
    .find({}, { projection: PROJECTION })
    .toArray();

  return storedDocs.map((d) => ({
    id: d.sourceId,
    name: d.title,
    org: d.org,
    number: d.courseNumber,
    language: d.language,
    hidden: d.hidden,
    synced: true,
    lastSyncedAt: d.fetchedAt,
    lastRunId: d.lastRunId,
  }));
}
