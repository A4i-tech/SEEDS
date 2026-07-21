# Log details

These log lines are just the normal output from a single-course sync run. Walking through them:

1. [subodha-server] listening on :4001 — the Express server (server.ts) started up and is listening on SUBODHA_SERVER_PORT (default 4001), ready to accept webhook/API calls.
2. [mongo] connected → SEEDS-Teacher-Backend (collection: subodhaCourses) — connectMongo() successfully connected to the Mongo database SEEDS-Teacher-Backend and confirmed it's using the subodhaCourses collection (from SUBODHA_COLLECTION_NAME).
3. [subodha] single-course run 66b8f75f-24c2-438d-bfc3-8da804c0d105 started for course-v1:edX+DemoX+Demo_Course (dryRun=false) — this is runSingleCourseSync kicking off a job with runId = 66b8f75f-... for course course-v1:edX+DemoX+Demo_Course. dryRun=false means it's actually writing to Mongo/Blob Storage, not just sim
4. [assets] SKIP /asset-v1:edX+DemoX+Demo_Course+type@asset+block/data_license.txt: Request failed with status code 404 —processing this course's blocks, fetchAndStoreAssetscular asset (data_license.txt) from the source LMS and got a 404 (the asset URL doesn't resolve — likely the file doesn't actually exist on the source, a common occurrence for optional/legacy asset references embedded in XBlock on-fatal, per-asset failure: it's skipped and recorded rather than aborting the whole course sync.
5. [assets] course-v1:edX+DemoX+Demo_Course: 17 save asset pass on this course: 17 assets weresuccessfully fetched and uploaded to Blob Storage, and 1 (the data_license.txt above) failed with a 404 and was skipped.

## How to run

### Backend Server

1. run server

   ```bash
   npm run server
   ```

2. run webhook-listener

   ```bash
   npm run webhook-listener
   ```

3. run frontend

   ```bash
   npm run dev
   ```
