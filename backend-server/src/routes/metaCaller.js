"use strict";
const express = require("express");
const multer = require("multer");
const { tryCatchWrapper } = require("../util");
const metaController = require("../controllers/meta.controller");
const { authenticateToken } = require("../auth/authenticateToken");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/**
 * @swagger
 * /meta/voice-command:
 *   post:
 *     summary: Execute a voice command against the backend
 *     description: |
 *       Accepts an audio recording, transcribes it using Groq Whisper,
 *       sends the transcript to an LLM that maps it to backend API calls,
 *       then executes those calls and returns the results.
 *
 *       **Sample voice prompts you can try:**
 *       - "Show me all my students"
 *       - "Get all classrooms"
 *       - "List all content in English"
 *       - "Get all available themes in Hindi"
 *       - "Show me tenant names"
 *       - "Add a student named Rahul with phone number 9876543210"
 *       - "Delete class with ID 661abc123def"
 *       - "Get my teacher profile"
 *     tags: [Meta]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [audio]
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file (webm, mp3, wav, etc.)
 *     responses:
 *       200:
 *         description: Voice command executed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transcript:
 *                   type: string
 *                   example: "show me all my students"
 *                 commands:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       method:
 *                         type: string
 *                         example: POST
 *                       path:
 *                         type: string
 *                         example: /v1/teacher/students
 *                       body:
 *                         type: object
 *                       description:
 *                         type: string
 *                         example: Get all students for current teacher
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       step:
 *                         type: string
 *                       status:
 *                         type: number
 *                       data:
 *                         type: object
 *       400:
 *         description: No audio file provided
 *       401:
 *         description: Unauthorized
 */
router.post("/voice-command", authenticateToken, upload.single("audio"), tryCatchWrapper(metaController.voiceCommand));

/**
 * @swagger
 * /meta/transcribe:
 *   post:
 *     summary: Transcribe audio only (no execution)
 *     tags: [Meta]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [audio]
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Transcription result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transcript:
 *                   type: string
 */
router.post("/transcribe", authenticateToken, upload.single("audio"), tryCatchWrapper(metaController.transcribe));

/**
 * @swagger
 * /meta/text-command:
 *   post:
 *     summary: Execute a text command (skips audio transcription)
 *     description: |
 *       Same as voice-command but accepts text directly. Useful for testing.
 *
 *       **Sample single-step commands:**
 *       - "Show me all my students"
 *       - "Get all classrooms"
 *       - "List content in English"
 *
 *       **Sample multi-step commands:**
 *       - "Get all my classrooms and also show me my students"
 *       - "Show me my profile and list all content themes in Hindi"
 *       - "Get all teachers in my school and then get all the students"
 *       - "Add a student named Ravi with phone 9876543210 and then show me all my students"
 *       - "List all tenant names and then get my teacher profile"
 *       - "Get English content and also get Hindi themes"
 *     tags: [Meta]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [command]
 *             properties:
 *               command:
 *                 type: string
 *                 example: "Get all my classrooms and also show me my students"
 *     responses:
 *       200:
 *         description: Command executed
 */
router.post("/text-command", authenticateToken, tryCatchWrapper(metaController.textCommand));


/**
 * @swagger
 * /meta/tts-prompt:
 *   post:
 *     summary: Get TTS audio for a static Seeds AI prompt
 *     description: Returns pre-defined spoken prompts (welcome, thinking) as base64 audio.
 *     tags: [Meta]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [welcome, thinking]
 *                 example: "welcome"
 *     responses:
 *       200:
 *         description: TTS prompt audio
 */
router.post("/tts-prompt", tryCatchWrapper(metaController.ttsPrompt));

module.exports = router;
