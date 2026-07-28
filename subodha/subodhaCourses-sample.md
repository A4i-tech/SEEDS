# subodhaCourses — sample document

DB: `SEEDS-Teacher-Backend` · Collection: `subodhaCourses` · Total docs: 1954

## Sample doc (blocks/assets stripped, doc is ~2.7MB with them)

```json
{
  "_id": "6a61e385c1a0f73058b3935b",
  "sourceId": "course-v1:edX+DemoX+Demo_Course",
  "contentHash": "f58c9be2d8da36b5ad03aec59ffc123b1bb40175939305a63822e717fb1651ba",
  "courseNumber": "DemoX",
  "description": "",
  "fetchedAt": "2026-07-23T09:48:54.232Z",
  "hidden": false,
  "invitationOnly": false,
  "language": null,
  "lastRunId": "efb36f79-00fc-4dcb-8536-3bba9b73bc39",
  "mobileAvailable": true,
  "org": "edX",
  "pacing": "instructor",
  "source": "subodha",
  "start": "2030-05-06T09:46:11.000Z",
  "title": "edX Demonstration Course"
}
```

## Full schema (18 fields)

| Field | Type |
|---|---|
| `_id` | ObjectId |
| `sourceId` | String |
| `contentHash` | String |
| `courseNumber` | String |
| `description` | String \| Null |
| `fetchedAt` | Date |
| `hidden` | Boolean |
| `invitationOnly` | Boolean |
| `language` | Null |
| `lastRunId` | String |
| `mobileAvailable` | Boolean |
| `org` | String |
| `pacing` | String |
| `source` | String |
| `start` | Date |
| `title` | String |
| `assets` | Document (heavy) |
| `blocks` | Array\<Document\> — each: `blockId`, `type`, `displayName`, `html`, `studentViewData` (null), `lmsUrl` |
