"use strict";
// Built-in modules
const express = require("express");
const path = require("path");

/**
 * @swagger
 * tags:
 *   name: Content
 *   description: Content management endpoints
 */

// Third-party modules
const Agenda = require("agenda");
const { ObjectId } = require("mongoose").Types;
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Project modules
const Content = require("../models/Content.js");
const { ContentV3 } = require("../models/ContentV3.js");
const QuizCreateRequest = require("../models/QuizCreateRequest.js");
const { QuizData, fromQuizCreateRequest } = require("../models/QuizData.js");
const BlobService = require("../services/BlobService.js");
const processNewContent = require("../jobs/processAudioContent.js");
const processQuizContent = require("../jobs/processQuizContent.js");
const { tryCatchWrapper } = require(path.join("..", "util.js"));
const { authenticateToken, authorizeRole } = require("../auth/authenticateToken");
const contentService = require("../services/content.service");

const TENANT_ROLE = "tenant";
const SCHOOL_ADMIN_ROLE = "school_admin";
const TEACHER_ROLE = "teacher";
const CONTENT_CREATOR_ROLE = "content_creator";

// For reads — school-scoped users see their own school's content + tenant content (schoolId: null)
function getReadSchoolIdFilter(req) {
  if (req.schoolId && (req.role === SCHOOL_ADMIN_ROLE || req.role === TEACHER_ROLE || req.role === CONTENT_CREATOR_ROLE)) {
    return { $in: [req.schoolId, null] };
  }
  return null;
}

// For writes (modify/delete) — strict ownership only
function getWriteSchoolIdFilter(req) {
  return (req.role === SCHOOL_ADMIN_ROLE || req.role === CONTENT_CREATOR_ROLE) ? req.schoolId : null;
}

// Initialize instances
const blobService = new BlobService();
const router = express.Router();
const agenda = new Agenda({ db: { address: process.env.DB_CONNECTION } });

agenda.define("processNewContent", async (job) => {
  await processNewContent(job);
});

agenda.define("processQuizContent", async (job) => {
  await processQuizContent(job);
});

// Start Agenda.
(async function () {
  await agenda.start();
})();

/** Sort merged content/quizzes by creation_time descending, then by _id descending as tie-breaker. */
function sortByCreationTimeThenId(a, b) {
  const timeA = a.creation_time;
  const timeB = b.creation_time;
  if (timeB !== timeA) return timeB - timeA;
  const idA = a._id.toString();
  const idB = b._id.toString();
  return idB.localeCompare(idA);
}

/**
 * @swagger
 * /content/job/{jobId}:
 *   get:
 *     summary: Get job status by ID
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: The job ID
 *     responses:
 *       200:
 *         description: Job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Job'
 *       404:
 *         description: Job not found
 */
router.get("/job/:jobId", authenticateToken, authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE), async (req, res) => {
  const job = await agenda.jobs({ _id: new ObjectId(req.params.jobId) });

  if (!job.length) {
    return res.status(404).json({ error: "Job not found" });
  }

  const jobData = job[0].attrs;

  res.json(jobData);
});

// API to list all jobs (Running + Failed)
/**
 * @swagger
 * /content/jobs:
 *   get:
 *     summary: Get list of all jobs (Running + Failed)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Job'
 */
router.get("/jobs", authenticateToken, authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE), async (req, res) => {
  try {
    // Fetch jobs that are either "In Progress" or "Failed"
    const jobs = await agenda.jobs({
      $or: [
        { failedAt: { $exists: true } }, // Failed jobs (any time)
        { lastRunAt: { $exists: true }, completedAt: { $exists: false } }, // Running jobs
      ],
    });

    // Transform job data with document existence check
    const jobList = (
      await Promise.all(
        jobs.map(async (job) => {
          const mongooseModel =
            job.attrs.name === "processQuizContent" ? QuizData : ContentV3;
          const contentId = job.attrs.data?.content?._id || null;
          let documentExists = false;

          // Check if document exists in MongoDB
          if (contentId) {
            documentExists = await mongooseModel.exists({ _id: contentId });
            if (documentExists) return null; // Skip this job
          }

          return {
            jobId: job.attrs._id,
            startedAt: job.attrs.data.startedAt,
            status: job.attrs.failedAt ? "ERROR" : "IN PROGRESS",
            metadata: {
              title: job.attrs.data.content.title.english,
              localTitle: job.attrs.data.content.title.local,
              language: job.attrs.data.content.language,
            },
          };
        }),
      )
    ).filter((job) => job !== null);
    jobList.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    res.json({ jobs: jobList });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /content/quiz:
 *   post:
 *     summary: Create a new quiz
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuizCreateRequest'
 *     responses:
 *       200:
 *         description: Quiz processing job scheduled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Processing New Content job scheduled!"
 *                 jobId:
 *                   type: string
 *                   example: "507f1f77bcf86cd799439011"
 *       400:
 *         description: Invalid quiz format
 */
router.post(
  "/quiz",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const quizCreateRequest = new QuizCreateRequest(req.body);
    if (quizCreateRequest.id === "default-id") {
      return res.status(400).json({ error: "Invalid Quiz format" });
    }
    const quizData = fromQuizCreateRequest(quizCreateRequest);
    quizData.creation_time = Math.floor(Date.now() / 1000);
    quizData.tenantId = req.tenantId;
    quizData.schoolId = req.schoolId || null;
    quizData.createdBy = req.userId;
    const quizDataDoc = quizData.toObject();
    const job = await agenda.now("processQuizContent", {
      content: quizDataDoc,
    });
    res.json({
      message: "Processing New Content job scheduled!",
      jobId: job.attrs._id,
    });
  }),
);

/**
 * @swagger
 * /content/sasUrl:
 *   get:
 *     summary: Get a SAS URL for a blob
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: The blob URL to generate a SAS token for
 *     responses:
 *       200:
 *         description: SAS URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: The URL with SAS token
 *       400:
 *         description: URL parameter is required
 */
router.get(
  "/sasUrl",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const url = req.query.url; // URL is now obtained from query string
    if (!url) {
      return res.status(400).json({ error: "URL parameter is required." });
    }

    const urlWithSAS = await blobService.getURLWithSAS(url);
    return res.json({ url: urlWithSAS });
  }),
);

/**
 * @swagger
 * /content/themes:
 *   get:
 *     summary: Get all themes for a specific language
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: language
 *         required: true
 *         schema:
 *           type: string
 *         description: Language code (e.g., 'en', 'hi')
 *     responses:
 *       200:
 *         description: List of themes with audio URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: Theme name in English
 *                   audioUrl:
 *                     type: string
 *                     description: URL to the theme's audio file
 */
router.get(
  "/themes",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId not found in token" });
    }
    const language = req.query.language;
    const content = await ContentV3.find({
      language: language,
      isPullModel: true,
      tenantId,
      schoolId: getReadSchoolIdFilter(req),
    })
      .sort({ _id: -1 })
      .lean()
      .exec();
    const themeSet = new Set();
    const themes = [];
    for (const cont of content) {
      const theme = cont.theme.english;
      if (!themeSet.has(theme)) {
        themes.push({
          name: theme,
          audioUrl: cont.theme.audioUrl,
        });
        themeSet.add(theme);
      }
    }
    return res.send(themes);
  }),
);

/**
 * @swagger
 * /content:
 *   get:
 *     summary: Get content based on query parameters (supports cursor-based pagination)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Language code (required with theme and expName)
 *       - in: query
 *         name: theme
 *         schema:
 *           type: string
 *         description: Theme name in English (URL encoded, required with language and expName)
 *       - in: query
 *         name: expName
 *         schema:
 *           type: string
 *         description: Content type (required with language and theme)
 *       - in: query
 *         name: ids
 *         schema:
 *           type: string
 *         description: Comma-separated list of content IDs to fetch (bypasses pagination)
 *       - in: query
 *         name: onlyTeacherApp
 *         schema:
 *           type: boolean
 *         description: If true, returns only teacher app content
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items to return per page
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor ID (the _id of the last item from previous page) for pagination
 *     responses:
 *       200:
 *         description: Paginated list of content items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   description: List of content items
 *                   items:
 *                     $ref: '#/components/schemas/ContentV3'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     nextCursor:
 *                       type: string
 *                       nullable: true
 *                       description: Cursor for fetching the next page (null if no more results)
 *                     hasMore:
 *                       type: boolean
 *                       description: Indicates if there are more results available
 *                     limit:
 *                       type: integer
 *                       description: Number of items returned per page
 */

router.get(
  "/",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId not found in token" });
    }

    const limit = parseInt(req.query.limit) || 15;
    const cursor = req.query.cursor;

    // If specific IDs are requested, return non-deleted content sorted by creation time (newest first)
    if (req.query.ids) {
      if (!Array.isArray(req.query.ids) || req.query.ids.length === 0) {
        return res.status(400).json({ error: "ids query parameter must be a non-empty array" });
      }
      const idsArray = req.query.ids.filter(Boolean);

      // Fetch both content and quiz data for the requested IDs (lean for read-only)
      const schoolIdFilter = getReadSchoolIdFilter(req);
      const [contents, quizzes] = await Promise.all([
        ContentV3.find({ _id: { $in: idsArray }, isDeleted: { $ne: true }, tenantId, schoolId: schoolIdFilter })
          .lean()
          .exec(),
        QuizData.find({ _id: { $in: idsArray }, isDeleted: { $ne: true }, tenantId, schoolId: schoolIdFilter })
          .lean()
          .exec(),
      ]);

      // Transform content to ensure id field exists (standardize: always use id from _id)
      const transformedContents = contents.map((content) => ({
        ...content,
        id: content._id,
      }));

      // Transform quiz data to match content format (standardize: always use id from _id)
      const transformedQuizzes = quizzes.map((quiz) => ({
        ...quiz,
        id: quiz._id,
        type: "quiz",
      }));

      // Merge and sort once (shared with list path via sortByCreationTimeThenId)
      const allContent = [...transformedContents, ...transformedQuizzes].sort(sortByCreationTimeThenId);

      return res.json(allContent);
    }

    // Base query always excludes deleted content
    let contentQuery = { isDeleted: { $ne: true }, tenantId, schoolId: getReadSchoolIdFilter(req) };
    let quizQuery = { isDeleted: { $ne: true }, tenantId, schoolId: getReadSchoolIdFilter(req) };
    let shouldFetchContent = true;
    let shouldFetchQuizzes = true;

    if (req.query.onlyTeacherApp) {
      contentQuery.isTeacherApp = true;
      quizQuery.isTeacherApp = true;
    } else if (req.query.language && req.query.theme && req.query.expName) {
      const expName = req.query.expName.toLowerCase();

      if (expName === "quiz") {
        // If filtering for quiz, only query QuizData
        shouldFetchContent = false;
        quizQuery.isPullModel = true;
        quizQuery.language = req.query.language;
        quizQuery["theme.english"] = decodeURIComponent(req.query.theme).toString();
      } else {
        // If filtering for other types, only query ContentV3
        shouldFetchQuizzes = false;
        contentQuery.isPullModel = true;
        contentQuery.language = req.query.language;
        contentQuery["theme.english"] = decodeURIComponent(req.query.theme).toString();
        contentQuery.type = expName;
      }
    }

    // When using cursor-based pagination, apply the cursor window at the DB level
    // so that .limit() operates on a deterministic, correctly ordered slice.
    let cursorCondition = null;
    if (cursor) {
      const [lastCreationTimeStr, lastId] = cursor.split("_");
      const lastCreationTime = parseInt(lastCreationTimeStr, 10);
      cursorCondition = {
        $or: [
          { creation_time: { $lt: lastCreationTime } },
          { creation_time: lastCreationTime, _id: { $lt: lastId } },
        ],
      };
    }

    const applyCursorCondition = (baseQuery) =>
      cursorCondition ? { $and: [baseQuery, cursorCondition] } : baseQuery;

    // Fetch limit+1 from each collection: any collection with more than `limit` unseen
    // items means there is more data to page through after merging.
    const fetchLimit = limit + 1;

    // Fetch content and/or quizzes only when needed (no empty Promise fallbacks)
    let contents = [];
    let quizzes = [];
    if (shouldFetchContent && shouldFetchQuizzes) {
      [contents, quizzes] = await Promise.all([
        ContentV3.find(applyCursorCondition(contentQuery))
          .sort({ creation_time: -1, _id: -1 })
          .limit(fetchLimit)
          .lean()
          .exec(),
        QuizData.find(applyCursorCondition(quizQuery))
          .sort({ creation_time: -1, _id: -1 })
          .limit(fetchLimit)
          .lean()
          .exec(),
      ]);
    } else if (shouldFetchContent) {
      contents = await ContentV3.find(applyCursorCondition(contentQuery))
        .sort({ creation_time: -1, _id: -1 })
        .limit(fetchLimit)
        .lean()
        .exec();
    } else if (shouldFetchQuizzes) {
      quizzes = await QuizData.find(applyCursorCondition(quizQuery))
        .sort({ creation_time: -1, _id: -1 })
        .limit(fetchLimit)
        .lean()
        .exec();
    }

    // Transform content to ensure id field exists (standardize: always use id from _id)
    // Note: .lean() returns plain objects, so no need for .toObject()
    const transformedContents = contents.map((contentObj) => {
      return {
        ...contentObj,
        id: contentObj._id,
      };
    });

    // Transform quiz data to match content format (standardize: always use id from _id)
    // Note: .lean() returns plain objects, so no need for .toObject()
    const transformedQuizzes = quizzes.map((quizObj) => {
      return {
        ...quizObj,
        id: quizObj._id,
        type: "quiz",
      };
    });

    // Merge content and quizzes, then sort once by creation_time and _id
    let allContent = [...transformedContents, ...transformedQuizzes];
    allContent.sort(sortByCreationTimeThenId);

    // Apply limit and check if there are more items
    const hasMore = allContent.length > limit;
    const data = hasMore ? allContent.slice(0, limit) : allContent;

    // Generate next cursor from last item (standardized: use id field)
    const lastItem = hasMore ? data[data.length - 1] : null;
    let nextCursor = null;
    if (lastItem) {
      const lastId = lastItem._id.toString();
      nextCursor = `${lastItem.creation_time}_${lastId}`;
    }

    // Send the final response
    return res.json({
      data,
      pagination: {
        nextCursor,
        hasMore,
        limit,
      },
    });
  }),
);

// async function regenerateAllTitleAudios(){
//     const contents = await Content.find({isProcessed: true, isPullModel: true})
//     for(const content of contents){
//         const response = await fetch(
//             'https://seedscontent.azurewebsites.net/api/acs',
//             {
//                 method: 'POST',
//                 body: JSON.stringify({
//                     type: "create-title-audio",
//                     id: content.id,
//                     localTitle: content.localTitle,
//                     theme: content.theme,
//                     localTheme: content.localTheme,
//                     lang: content.language,
//                     expType: content.type
//                 }),
//                 headers: { 'Content-Type': 'application/json' }
//             }
//         )
//         const jsonResponse = await response.json()
//         const titleAudio = jsonResponse.titleAudio
//         const themeAudio = jsonResponse.themeAudio

//         await Content.findOneAndUpdate(
//             { id: content.id },
//             { $set: { titleAudio, themeAudio } },
//             { new: true }
//         ).exec()

//     }
// }

// router.post("/regenerateAllTitleAudios", async (req,res) => {
//     regenerateAllTitleAudios()
//     return res.send("received. working on these...")
// })

router.get(
  "/sasToken",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const containerName = "input-container";
    const blobName = req.query.blobName;
    if (!blobName || !blobName.toLowerCase().endsWith(".mp3")) {
      return res.status(400).json({ error: "Only .mp3 files are allowed." });
    }
    const sasToken = await blobService.getUploadSASToken(blobName, containerName);
    const container_client = blobService.getContainerClient(containerName);

    return res.json({
      sasToken: `${container_client.getBlockBlobClient(req.query.blobName).url}?${sasToken}`,
    });
  }),
);

router.get(
  "/quiz/:quizId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const quiz = await QuizData.findOne({
      _id: req.params.quizId,
      tenantId: req.tenantId,
      isDeleted: { $ne: true },
      schoolId: getReadSchoolIdFilter(req),
    }).lean().exec();
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    return res.json({ ...quiz, id: quiz._id, type: "quiz" });
  })
);

router.get(
  "/:contentId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const content = await ContentV3.findOne({
      _id: req.params.contentId,
      tenantId: req.tenantId,
      isDeleted: { $ne: true },
      schoolId: getReadSchoolIdFilter(req),
    }).lean().exec();
    if (!content) {
      return res.status(404).json({ error: "Content not found" });
    }
    return res.json({ ...content, id: content._id });
  })
);

// router.get("/:contentId/processed", tryCatchWrapper(async (req, res) => {
//     const content = await Content.getContentById(req.params.contentId);
//     // if the content is already processed just return that content object
//     if(content.isProcessed){
//         return content
//     }
//     let titleAudio = content.titleAudio;
//     let themeAudio = content.themeAudio;

//     var response = undefined
//     if (content.isPullModel) {
//         response =  await fetch(
//             'https://seedscontent.azurewebsites.net/api/acs',
//             {
//                 method: 'POST',
//                 body: JSON.stringify({
//                     type: "create-title-audio",
//                     id: req.params.contentId,
//                     localTitle: content.localTitle,
//                     theme: content.theme,
//                     localTheme: content.localTheme,
//                     lang: content.language,
//                     expType: content.type
//                 }),
//                 headers: { 'Content-Type': 'application/json' }
//             }
//         )
//     }
//     if(response){
//         const jsonResponse = await response.json()
//         titleAudio = jsonResponse.titleAudio
//         themeAudio = jsonResponse.themeAudio
//     }

//     return res.json(await Content.findOneAndUpdate(
//         { id: req.params.contentId },
//         { $set: { isProcessed: true, titleAudio, themeAudio } },
//         { new: true }
//     ).exec())
// }))

router.delete(
  "/quiz/:quizId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const result = await QuizData.findOneAndUpdate(
      { _id: req.params.quizId, tenantId: req.tenantId, schoolId: getWriteSchoolIdFilter(req) },
      { $set: { isDeleted: true } },
      { new: true }
    );
    if (!result) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    return res.json(result);
  }),
);

router.delete(
  "/:contentId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const result = await ContentV3.findOneAndUpdate(
      { _id: req.params.contentId, tenantId: req.tenantId, schoolId: getWriteSchoolIdFilter(req) },
      { $set: { isDeleted: true } },
      { new: true }
    );
    if (!result) {
      return res.status(404).json({ error: "Content not found" });
    }
    return res.json(result);
  }),
);

router.post(
  "/",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    let content = new ContentV3(req.body);
    content.creation_time = Math.floor(Date.now() / 1000);
    content.tenantId = req.tenantId;
    content.schoolId = req.schoolId || null;
    content.createdBy = req.userId;

    // Validate audioContent entries to ensure uploaded audio URLs reference .mp3 files.
    for (const item of content.audioContent || []) {
      if (item.audioUrl && !item.audioUrl.toLowerCase().endsWith(".mp3")) {
        return res.status(400).json({ error: "Only .mp3 audio files are allowed." });
      }
    }

    const savedContent = await content.save();

    const job = await agenda.now("processNewContent", {
      content: savedContent.toObject(),
    });
    res.json({
      message: "Processing New Content job scheduled!",
      jobId: job.attrs._id,
    });
  }),
);

router.patch(
  "/quiz/:quizId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const body = req.body || {};
    const updatePayload = contentService.sanitizePatchableContentFields(body);
    const writeSchoolId = getWriteSchoolIdFilter(req);

    const existingQuiz = await QuizData.findOne({
      _id: req.params.quizId,
      tenantId: req.tenantId,
      schoolId: writeSchoolId,
    }).lean().exec();
    if (!existingQuiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    let quizUpdate;
    try {
      quizUpdate = contentService.buildQuizUpdatePayload(existingQuiz, updatePayload);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const updated = await QuizData.findOneAndUpdate(
      { _id: req.params.quizId, tenantId: req.tenantId, schoolId: writeSchoolId },
      { $set: quizUpdate },
      { new: true },
    ).exec();
    if (!updated) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    return res.json({ ...updated.toObject(), id: updated._id, type: "quiz" });
  }),
);

router.patch(
  "/:contentId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const isAudioUploaded = req.query.isAudioUploaded === "true";
    const body = req.body || {};
    const updatePayload = contentService.sanitizePatchableContentFields(body);
    const storyUpdate = contentService.buildStoryUpdatePayload(updatePayload, { isAudioUploaded });
    const writeSchoolId = getWriteSchoolIdFilter(req);

    const updated = await ContentV3.findOneAndUpdate(
      {
        _id: req.params.contentId,
        tenantId: req.tenantId,
        schoolId: writeSchoolId,
        isDeleted: { $ne: true },
      },
      { $set: storyUpdate },
      { new: true },
    ).exec();
    if (!updated) {
      return res.status(404).json({ error: "Content not found" });
    }

    if (isAudioUploaded) {
      await agenda.now("processNewContent", { content: updated.toObject() });
    }
    return res.json({ ...updated.toObject(), id: updated._id });
  }),
);

// router.patch("/",tryCatchWrapper(async (req,res) => {
//     const isAudioUploaded = req.query.isAudioUploaded === "true"
//     if(!req.body.isPullModel){
//         const response =  await fetch(
//             'https://seedscontent.azurewebsites.net/api/acs',
//             {
//                 method: 'POST',
//                 body: JSON.stringify({
//                     type:"delete-title-audio",
//                     id: req.body.id
//                 }),
//                 headers: { 'Content-Type': 'application/json' }
//             }
//         )
//     }
//     var titleAudio = ""
//     var themeAudio = ""
//     var isProcessed = undefined
//     if(isAudioUploaded){
//         isProcessed = false
//     }
//     else{
//         isProcessed = req.body.isProcessed
//         if(req.body.isPullModel){
//             const response =  await fetch(
//                     'https://seedscontent.azurewebsites.net/api/acs',
//                     {
//                         method: 'POST',
//                         body: JSON.stringify({
//                             type: "create-title-audio",
//                             id: req.body.id,
//                             localTitle: req.body.localTitle,
//                             theme: req.body.theme,
//                             localTheme: req.body.localTheme,
//                             lang: req.body.language,
//                             expType: req.body.type
//                         }),
//                         headers: { 'Content-Type': 'application/json' }
//                     }
//                 )
//             const jsonResponse = await response.json()
//             titleAudio = jsonResponse.titleAudio
//             themeAudio = jsonResponse.themeAudio
//         }
//     }
//     return res.json(await Content.findOneAndUpdate(
//             {
//                 _id:req.body._id // we can use id:req.body.id here id means audioId, this also works.
//             },
//             {
//                 $set: {
//                     title:req.body.title,
//                     description: req.body.description,
//                     type: req.body.type,
//                     language: req.body.language,
//                     isPullModel: req.body.isPullModel,
//                     isTeacherApp: req.body.isTeacherApp,
//                     isProcessed: isProcessed,
//                     titleAudio: titleAudio,
//                     localTitle: req.body.localTitle,
//                     theme: req.body.theme,
//                     localTheme: req.body.localTheme,
//                     themeAudio: themeAudio
//                 }
//             },
//             {
//                 new: true
//             }
//         ))
// }))

// async function populateAllTitleAudiosForPullModel(){
//     const contents = await Content.find({isPullModel: true})
//     for(const content of contents){
//         try{
//             const response =  await fetch(
//                 'https://seedscontent.azurewebsites.net/api/acs',
//                 {
//                     method: 'POST',
//                     body: JSON.stringify({
//                         type: "create-title-audio",
//                         id: content.id,
//                         localTitle: content.localTitle,
//                         theme: content.theme,
//                         localTheme: content.localTheme,
//                         lang: content.language,
//                         expType: content.type
//                     }),
//                     headers: { 'Content-Type': 'application/json' }
//                 }
//             )
//             const jsonResponse = await response.json()
//             const titleAudio = jsonResponse.titleAudio
//             const themeAudio = jsonResponse.themeAudio

//             await Content.findOneAndUpdate(
//                 { id: content.id },
//                 { $set: { titleAudio, themeAudio } },
//                 { new: true }
//             ).exec()
//         }
//         catch(err){
//             console.error(err)
//         }

//     }
// }
// router.post("/populate-title-audios",async (req,res) => {
//     populateAllTitleAudiosForPullModel()
//     return res.send("populating...")
// })

async function deleteBlobFromAContainer(containerName, blobNamePrefix) {
  const containerClient = blobService.getContainerClient(containerName);
  const options = {
    deleteSnapshots: "include", // include snapshots when deleting
  };
  const blobList = containerClient.listBlobsFlat({ prefix: blobNamePrefix });
  for await (const blob of blobList) {
    await containerClient.deleteBlob(blob.name, options);
  }
}

async function deleteAudioBlobs(audioId) {
  const blobNamePrefix = audioId;

  var containerName = "output-container";
  await deleteBlobFromAContainer(containerName, blobNamePrefix);

  containerName = "output-original";
  await deleteBlobFromAContainer(containerName, blobNamePrefix);

  containerName = "experience-titles";
  await deleteBlobFromAContainer(containerName, blobNamePrefix);
}

async function deleteUnnecessaryStorage() {
  const docs = await Content.find({}).lean().exec();
  const containerName = "output-container";
  const containerClient = blobService.getContainerClient(containerName);
  for (const doc of docs) {
    var deleteDoc = false;
    var deleteBlob = false;
    if (!doc.isProcessed) {
      deleteDoc = true;
      deleteBlob = true;
    }
    const blobs = containerClient.listBlobsFlat({ prefix: doc.id });
    const iterator = blobs.next();
    const { done } = await iterator;
    if (done) {
      deleteDoc = true;
    }
    if (deleteDoc) {
      await Content.deleteOne({ id: doc.id });
    }
    if (deleteBlob) {
      await deleteAudioBlobs(doc.id);
    }
  }
}
router.post("/delete-unnecessary-storage", authenticateToken, authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE), async (req, res) => {
  await deleteUnnecessaryStorage();
  return res.send("Deleted Successfully");
});

// router.post("/change-type-from-snippets-to-snippet", async (req,res) => {
//     await Content.updateMany({type:"Snippets"},{$set: {type: "Snippet"}})
//     res.send("Done");
// })
module.exports = router;
