"use strict";
const express = require("express");
const { model } = require("mongoose");
const Call = require("../models/Call.js");
const CallLog = require("../models/CallLog.js");
const FsmContext = require("../models/FsmContext.js");
const path = require("path");
const { tryCatchWrapper, tryCatchWrapperLog } = require(path.join("..", "util.js"));
const { confServerUrl } = require("../config/env");

const axios = require("axios").default;

// Ensure IVR base URL always ends with a slash
function ivrUrl(path) {
  const base = process.env.IVR_SERVER_URL || "";
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

// Build ConferenceV2 URL
function confUrl(path) {
  const base = confServerUrl || "";
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

// Normalize phone number to 91XXXXXXXXXX format (matching frontend behavior)
function normalizePhone(phone) {
  if (!phone) return phone;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits;
  const cleaned = digits.startsWith("91") ? digits.substring(2) : digits;
  return cleaned.length === 10 ? `91${cleaned}` : `91${digits}`;
}

/**
 * @swagger
 * tags:
 *   name: Calls
 *   description: Call management endpoints
 */
const router = express.Router();

/**
 * @swagger
 * /call/accessToken:
 *   get:
 *     summary: Get an access token for conference calls
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Access token retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token for conference calls
 */

router.get(
  "/accessToken",
  tryCatchWrapper(async (req, res) => {
    console.log(process.env.IVR_SERVER_URL);
    console.log("HERE");
    const response = await axios.get(ivrUrl("conference_call/accessToken"));
    console.log(response.data);
    return res.json(response.data);
  })
);

/**
 * @swagger
 * /call/start:
 *   post:
 *     summary: Start a new conference call
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               from:
 *                 type: string
 *                 description: Caller's phone number
 *               to:
 *                 type: string
 *                 description: Recipient's phone number
 *               callId:
 *                 type: string
 *                 description: Unique identifier for the call
 *     responses:
 *       200:
 *         description: Call started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 callId:
 *                   type: string
 *                 status:
 *                   type: string
 */

router.post(
  "/start",
  tryCatchWrapperLog(async (req, res) => {
    console.log("START CALL BOD", req.body);
    const response = await axios.post(ivrUrl("conference_call"), req.body);
    console.log("START CALL RESPONSE", response.data);
    return res.json(response.data);
  })
);

/**
 * @swagger
 * /call/{confId}/status:
 *   get:
 *     summary: Get the status of a conference call
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: confId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conference call ID
 *     responses:
 *       200:
 *         description: Call status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 callId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 participants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       number:
 *                         type: string
 *                       status:
 *                         type: string
 */

router.get(
  "/:confId/status",
  tryCatchWrapper(async (req, res) => {
    const response = await axios.get(
      ivrUrl(`conference_call/${req.params.confId}/status`)
    );
    return res.json(response.data);
  })
);

/**
 * @swagger
 * /call/logCall:
 *   post:
 *     summary: Log call details
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CallLog'
 *     responses:
 *       200:
 *         description: Call logged successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CallLog'
 */

router.post(
  "/logCall",
  tryCatchWrapper(async (req, res) => {
    const callLog = CallLog(req.body);
    await callLog.save();
    return res.json(callLog);
  })
);

/**
 * @swagger
 * /call/fsmContext:
 *   post:
 *     summary: Save FSM context for a call
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FsmContext'
 *     responses:
 *       200:
 *         description: FSM context saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FsmContext'
 */

router.post(
  "/fsmContext",
  tryCatchWrapper(async (req, res) => {
    const fsmContext = FsmContext(req.body);
    await fsmContext.save();
    return res.json(fsmContext);
  })
);

/**
 * @swagger
 * /call/fsmContext/{contextId}:
 *   get:
 *     summary: Get FSM context by ID
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contextId
 *         required: true
 *         schema:
 *           type: string
 *         description: FSM context ID
 *     responses:
 *       200:
 *         description: FSM context retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FsmContext'
 */

router.get(
  "/fsmContext/:contextId",
  tryCatchWrapper(async (req, res) => {
    return res.json(await FsmContext.getContextById(req.params.contextId));
  })
);

/**
 * @swagger
 * /call/logCall/{callId}:
 *   get:
 *     summary: Get call log by ID
 *     tags: [Calls]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *         description: Call log ID
 *     responses:
 *       200:
 *         description: Call log retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CallLog'
 */

router.get(
  "/logCall/:callId",
  tryCatchWrapper(async (req, res) => {
    return res.json(await CallLog.getCallLogById(req.params.callId));
  })
);

// ── ConferenceV2 proxy routes ────────────────────────────────────────────────

router.post(
  "/conference/create",
  tryCatchWrapper(async (req, res) => {
    const body = {
      teacher_phone: normalizePhone(req.body.teacher_phone),
      teacher_name: req.body.teacher_name || null,
      student_phones: (req.body.student_phones || []).map(normalizePhone),
      student_names: req.body.student_names || [],
      leader_phone: req.body.leader_phone ? normalizePhone(req.body.leader_phone) : null,
    };
    console.log("[confV2] Creating conference:", JSON.stringify(body));
    const response = await axios.post(confUrl("conference/create"), body, { timeout: 15000 });
    console.log("[confV2] Create response:", response.data);
    return res.json(response.data);
  })
);

router.post(
  "/conference/start/:confId",
  tryCatchWrapper(async (req, res) => {
    console.log("[confV2] Starting conference:", req.params.confId);
    const response = await axios.post(confUrl(`conference/start/${req.params.confId}`), {}, { timeout: 30000 });
    console.log("[confV2] Start response:", response.data);
    return res.json(response.data);
  })
);

router.put(
  "/conference/end/:confId",
  tryCatchWrapper(async (req, res) => {
    const response = await axios.put(confUrl(`conference/end/${req.params.confId}`), {}, { timeout: 15000 });
    return res.json(response.data);
  })
);

router.put(
  "/conference/muteall/:confId",
  tryCatchWrapper(async (req, res) => {
    const response = await axios.put(confUrl(`conference/muteall/${req.params.confId}`), {}, { timeout: 15000 });
    return res.json(response.data);
  })
);

router.put(
  "/conference/unmuteall/:confId",
  tryCatchWrapper(async (req, res) => {
    const response = await axios.put(confUrl(`conference/unmuteall/${req.params.confId}`), {}, { timeout: 15000 });
    return res.json(response.data);
  })
);

router.put(
  "/conference/addparticipant/:confId",
  tryCatchWrapper(async (req, res) => {
    const phone = normalizePhone(req.body.phone_number || req.query.phone_number);
    const name = req.body.name || req.query.name || "";
    const response = await axios.put(
      confUrl(`conference/addparticipant/${req.params.confId}?phone_number=${phone}&name=${encodeURIComponent(name)}`),
      {},
      { timeout: 15000 }
    );
    return res.json(response.data);
  })
);

router.put(
  "/conference/removeparticipant/:confId",
  tryCatchWrapper(async (req, res) => {
    const phone = normalizePhone(req.body.phone_number || req.query.phone_number);
    const response = await axios.put(
      confUrl(`conference/removeparticipant/${req.params.confId}?phone_number=${phone}`),
      {},
      { timeout: 15000 }
    );
    return res.json(response.data);
  })
);

router.put(
  "/conference/playaudio/:confId",
  tryCatchWrapper(async (req, res) => {
    const url = req.body.url || req.query.url;
    if (!url) return res.status(400).json({ error: "url parameter is required" });
    const response = await axios.put(
      confUrl(`conference/playaudio/${req.params.confId}?url=${encodeURIComponent(url)}`),
      {},
      { timeout: 15000 }
    );
    return res.json(response.data);
  })
);

router.put(
  "/conference/pauseaudio/:confId",
  tryCatchWrapper(async (req, res) => {
    const response = await axios.put(confUrl(`conference/pauseaudio/${req.params.confId}`), {}, { timeout: 15000 });
    return res.json(response.data);
  })
);

module.exports = router;
