"use strict";
const express = require("express");
const path = require("path");
const Log = require(path.join("..", "models", "Log.js"));
const { tryCatchWrapper } = require(path.join("..", "util.js"));

/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: Log management endpoints
 */
const router = express.Router();

/**
 * @swagger
 * /log:
 *   post:
 *     summary: Create multiple log entries
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/LogEntry'
 *     responses:
 *       200:
 *         description: Log entries created successfully
 *       400:
 *         description: Invalid log data provided
 */
router.post('/', tryCatchWrapper( async (req, res) => {
    await Log.insertMany(req.body);
    return res.sendStatus(200);
}))

/**
 * @swagger
 * /log/{userId}:
 *   get:
 *     summary: Get logs by user ID
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to retrieve logs for
 *     responses:
 *       200:
 *         description: List of log entries for the user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       404:
 *         description: No logs found for the specified user
 */
router.get("/:userId", tryCatchWrapper(async (req, res) => {
    return res.json(await Log.getLogsByUserId(req.params.userId));
}))

module.exports = router;