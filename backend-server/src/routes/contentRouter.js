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
const ISO6391 = require("iso-639-1");

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
  tryCatchWrapper(async (req, res) => {
    const language = req.query.language;
    const content = await ContentV3.find({
      tenantId: req.tenantId,
      schoolId: getReadSchoolIdFilter(req),
      language: language,
      isPullModel: true,
    }).sort({ _id: -1 });
    const themeSet = new Set();
    const themes = [];
    console.log(content.length);
    console.log(language);
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

// Helper to sort content by creation_time (desc) and _id (desc)
const sortByCreationTimeThenId = (a, b) => {
  if (b.creation_time !== a.creation_time) {
    return b.creation_time - a.creation_time;
  }
  return b._id.toString().localeCompare(a._id.toString());
};

router.get(
  "/",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const limit = parseInt(req.query.limit) || 15;
    const cursor = req.query.cursor;

    const tenantId = req.tenantId;
    const schoolIdFilter = getReadSchoolIdFilter(req);

    // If specific IDs are requested, return non-deleted content sorted by creation time (newest first)
    if (req.query.ids) {
      if (!Array.isArray(req.query.ids) || req.query.ids.length === 0) {
        return res.status(400).json({ error: "ids query parameter must be a non-empty array" });
      }
      const idsArray = req.query.ids;

      // Fetch both content and quiz data for the requested IDs (lean for read-only)
      const [contents, quizzes] = await Promise.all([
        ContentV3.find({ _id: { $in: idsArray }, tenantId, isDeleted: { $ne: true }, schoolId: schoolIdFilter })
          .lean()
          .exec(),
        QuizData.find({ _id: { $in: idsArray }, tenantId, isDeleted: { $ne: true }, schoolId: schoolIdFilter })
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

    // Base query always excludes deleted content, scoped to tenant
    let baseQuery = { isDeleted: { $ne: true }, tenantId: req.tenantId, schoolId: schoolIdFilter };
    let contentQuery = { ...baseQuery };
    let quizQuery = { ...baseQuery };

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

    if (cursor) {
      const [lastCreationTimeStr] = cursor.split("_");
      const lastCreationTime = parseInt(lastCreationTimeStr, 10);
      const cursorFilter = { creation_time: { $lte: lastCreationTime } };
      if (shouldFetchContent) contentQuery = { ...contentQuery, ...cursorFilter };
      if (shouldFetchQuizzes) quizQuery = { ...quizQuery, ...cursorFilter };
    }

    const [contents, quizzes] = await Promise.all([
      shouldFetchContent ? ContentV3.find(contentQuery).sort({ creation_time: -1 }).lean().exec() : [],
      shouldFetchQuizzes ? QuizData.find(quizQuery).sort({ creation_time: -1 }).lean().exec() : [],
    ]);

    const transformedContents = contents.map((c) => ({ ...c, id: c._id }));
    const transformedQuizzes = quizzes.map((q) => ({ ...q, id: q._id, type: "quiz" }));

    let allResults = [...transformedContents, ...transformedQuizzes].sort(sortByCreationTimeThenId);

    if (cursor) {
      const [lastCreationTimeStr, lastId] = cursor.split("_");
      const lastCreationTime = parseInt(lastCreationTimeStr, 10);
      const idx = allResults.findIndex(
        (item) => item.creation_time === lastCreationTime && item._id.toString() === lastId,
      );
      if (idx !== -1) allResults = allResults.slice(idx + 1);
    }

    const hasMore = allResults.length > limit;
    const data = allResults.slice(0, limit);
    const lastItem = data.length > 0 ? data[data.length - 1] : null;
    const nextCursor = hasMore && lastItem
      ? `${lastItem.creation_time}_${lastItem._id.toString()}`
      : null;

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
//         console.log(`started working for content id=${content.id}`)
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

//         console.log(`id = ${content.id}`)
//         console.log(`titleAudio = ${titleAudio}`)
//         console.log(`ThemeAudio = ${themeAudio}`)
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
  "/:contentId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const query = {
      _id: req.params.contentId,
      tenantId: req.tenantId,
      schoolId: getReadSchoolIdFilter(req),
      isDeleted: { $ne: true },
    };
    const content = await ContentV3.findOne(query);
    if (content) return res.json(content);

    const quiz = await QuizData.findOne(query);
    if (quiz) return res.json({ ...quiz.toObject(), id: quiz._id, type: "quiz" });

    return res.status(404).json({ error: "Content not found" });
  }),
);

router.patch(
  "/",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const isRegionalLanguage = (language) =>
      typeof language === "string" && language.trim().toLowerCase() !== "en";

    const mergeTextContent = ({ value, current, language, localOverride }) => {
      const merged = {
        english: current?.english ?? "",
        local: current?.local ?? "",
        audioUrl: current?.audioUrl ?? "",
      };

      if (typeof value === "string") {
        // If caller also sends explicit local text, treat string value as English.
        // This supports payloads like { title: "...en...", localTitle: "...local..." }.
        if (localOverride !== undefined) {
          merged.english = value;
        } else {
          const targetKey = isRegionalLanguage(language) ? "local" : "english";
          merged[targetKey] = value;
        }
      } else if (value && typeof value === "object") {
        ["english", "local", "audioUrl"].forEach((key) => {
          if (value[key] !== undefined) merged[key] = value[key];
        });
      }

      if (localOverride !== undefined) merged.local = localOverride;
      return merged;
    };

    const applyTextUpdate = (doc, key, value, localOverride, language) => {
      if (value === undefined && localOverride === undefined) return;
      doc[key] = mergeTextContent({ value, current: doc[key], language, localOverride });
    };


    if (req.body.language !== undefined && !ISO6391.validate(req.body.language)) {
      return res.status(400).json({ error: `language must be a valid ISO 639-1 code. Received: "${req.body.language}"` });
    }

    const isAudioUploaded = req.query.isAudioUploaded === "true";
    const contentId = req.body?._id;
    if (!contentId) return res.status(400).json({ error: "Content _id is required" });

    const writeFilter = {
      _id: contentId,
      tenantId: req.tenantId,
      schoolId: getWriteSchoolIdFilter(req),
      isDeleted: { $ne: true },
    };

    // Quiz branch first
    const quiz = await QuizData.findOne(writeFilter);
    if (quiz) {
      const {
        title,
        theme,
        localTitle,
        localTheme,
        positiveMarks,
        positiveMark,
        negativeMarks,
        negativeMark,
        isPullModel,
        isTeacherApp,
        questions,
      } = req.body;

      const newPositiveMarks = positiveMarks ?? positiveMark;
      const newNegativeMarks = negativeMarks ?? negativeMark;
      if (newPositiveMarks !== undefined) quiz.positiveMarks = newPositiveMarks;
      if (newNegativeMarks !== undefined) quiz.negativeMarks = newNegativeMarks;

      applyTextUpdate(quiz, "title", title, localTitle, quiz.language);
      applyTextUpdate(quiz, "theme", theme, localTheme, quiz.language);
      if (isPullModel !== undefined) quiz.isPullModel = isPullModel;
      if (isTeacherApp !== undefined) quiz.isTeacherApp = isTeacherApp;

      if (questions !== undefined && Array.isArray(questions)) {
        const { options: optionsMatrix, correctAnswers } = req.body;
        quiz.questions = questions.map((q, index) => {
          const existing = quiz.questions[index];
          // q can be a plain string (flat format from AddQuiz) or a structured object
          const isFlatFormat = typeof q === "string";
          const questionText = isFlatFormat ? q : (typeof q.question === "string" ? q.question : q.question?.text);

          // options: flat format sends a parallel matrix; structured format embeds in q
          const optionsForQ = optionsMatrix?.[index] ?? q.options ?? [];

          // correct option: flat format sends correctAnswers index; structured sends correct_option_id
          const correct_option_id = correctAnswers?.[index] !== undefined
            ? `${contentId}-q${index + 1}-opt${correctAnswers[index] + 1}`
            : (q.correct_option_id || existing?.correct_option_id);

          return {
            question: {
              id: (!isFlatFormat && q.question?.id) || existing?.question?.id || `${contentId}-q${index + 1}`,
              url: (!isFlatFormat && q.question?.url) || existing?.question?.url || "<NOT CREATED>",
              text: questionText ?? existing?.question?.text ?? "",
            },
            options: optionsForQ.map((opt, optIndex) => {
              const existingOpt = existing?.options?.[optIndex];
              const optText = typeof opt === "string" ? opt : opt?.text;
              return {
                id: (typeof opt === "object" && opt?.id) || existingOpt?.id || `${contentId}-q${index + 1}-opt${optIndex + 1}`,
                url: (typeof opt === "object" && opt?.url) || existingOpt?.url || "<NOT CREATED>",
                text: optText ?? existingOpt?.text ?? "",
              };
            }),
            correct_option_id,
          };
        });
      }

      await quiz.save();
      const quizJob = await agenda.now("processQuizContent", { content: quiz.toObject() });
      return res.json({ ...quiz.toObject(), id: quiz._id, type: "quiz", jobId: quizJob.attrs._id });
    }

    // ContentV3 branch — build $set from same mutable fields as POST
    const { title, theme, description, type, language, audioContent, isPullModel, isTeacherApp } = req.body;

    const update = {};
    if (title !== undefined) update.title = title;
    if (theme !== undefined) update.theme = theme;
    if (description !== undefined) update.description = description;
    if (type !== undefined) update.type = type;
    if (language !== undefined) update.language = language;
    if (isPullModel !== undefined) update.isPullModel = isPullModel;
    if (isTeacherApp !== undefined) update.isTeacherApp = isTeacherApp;

    if (isAudioUploaded) {
      if (audioContent !== undefined) {
        for (const item of audioContent) {
          if (item.audioUrl && !item.audioUrl.toLowerCase().endsWith(".mp3")) {
            return res.status(400).json({ error: "Only .mp3 audio files are allowed." });
          }
        }
        update.audioContent = audioContent;
      }
      update.isProcessed = false;
    }

    const content = await ContentV3.findOneAndUpdate(writeFilter, { $set: update }, { new: true });
    if (content) {
      if (isAudioUploaded) {
        const job = await agenda.now("processNewContent", { content: content.toObject() });
        return res.json({ ...content.toObject(), jobId: job.attrs._id });
      }
      return res.json(content);
    }

    return res.status(404).json({ error: "Content not found" });
  }),
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
  "/:contentId",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    const writeFilter = {
      _id: req.params.contentId,
      tenantId: req.tenantId,
      schoolId: getWriteSchoolIdFilter(req),
    };

    const contentResult = await ContentV3.updateOne(writeFilter, { $set: { isDeleted: true } });
    if (contentResult.matchedCount > 0) return res.json(contentResult);

    const quizResult = await QuizData.updateOne(writeFilter, { $set: { isDeleted: true } });
    if (quizResult.matchedCount > 0) return res.json(quizResult);

    return res.status(404).json({ error: "Content not found" });
  }),
);

router.post(
  "/",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE),
  tryCatchWrapper(async (req, res) => {
    if (!ISO6391.validate(req.body.language)) {
      return res.status(400).json({ error: `language must be a valid ISO 639-1 code. Received: "${req.body.language}"` });
    }

    let content = new ContentV3(req.body);
    content.tenantId = req.tenantId;
    content.createdBy = req.userId;
    content.creation_time = Math.floor(Date.now() / 1000);
    content.schoolId = req.schoolId || null;

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
//             console.log(`Processed for id = ${content.id} and title = ${content.title}`)
//         }
//         catch(err){
//             console.log(`Error occured while handling content id = ${content.id} and Title = ${content.title}`)
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
    console.log(`Deleted blob with name = ${blob.name}`);
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
      console.log(`Deleted doc with id = ${doc.id}`);
    }
    if (deleteBlob) {
      await deleteAudioBlobs(doc.id);
      console.log(`Deleted blob with id = ${doc.id}`);
    }
  }
}
router.post("/delete-unnecessary-storage", async (req, res) => {
  await deleteUnnecessaryStorage();
  return res.send("Deleted Successfully");
});

// router.post("/change-type-from-snippets-to-snippet", async (req,res) => {
//     await Content.updateMany({type:"Snippets"},{$set: {type: "Snippet"}})
//     res.send("Done");
// })
module.exports = router;
