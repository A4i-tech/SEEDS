"use strict";
const express = require("express");
const { model } = require("mongoose");
const Call = require("../models/Call.js");
const CallLog = require("../models/CallLog.js");
const FsmContext = require("../models/FsmContext.js");
const path = require("path");
const { tryCatchWrapper, tryCatchWrapperLog } = require(path.join("..", "util.js"));
const logger = require("../logger");

const axios = require("axios").default;

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
    const response = await axios.get(`${process.env.IVR_SERVER_URL}conference_call/accessToken`);
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
    const response = await axios.post(`${process.env.IVR_SERVER_URL}conference_call`, req.body);
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
      `${process.env.IVR_SERVER_URL}conference_call/${req.params.confId}/status`
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

module.exports = router;
