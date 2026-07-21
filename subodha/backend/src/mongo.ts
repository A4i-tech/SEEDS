"use strict";
import { MongoClient, Db } from "mongodb";

const COLLECTION_NAME = process.env.SUBODHA_COLLECTION_NAME || "subodhaCourses";

let client: MongoClient | undefined;
let db: Db | undefined;

export async function connect(): Promise<Db> {
  if (db) return db;
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/SEEDS-Teacher-Backend";
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  await db.command({ ping: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ sourceId: 1 }, { unique: true });
  console.log(`[mongo] connected → ${db.databaseName} (collection: ${COLLECTION_NAME})`);
  return db;
}

export async function close(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}
