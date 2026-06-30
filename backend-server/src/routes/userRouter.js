"use strict";
const express = require("express");
const { model } = require("mongoose");
const UserInfo = require("../models/UserInfo.js");
const path = require("path");
const { tryCatchWrapper } = require(path.join("..", "util.js"));

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management endpoints
 */
const router = express.Router();

const encryption_key = process.env.PHONE_NUMBER_ENCRYPTION_KEY;

/**
 * @swagger
 * /user/participants:
 *   get:
 *     summary: Get all participants (users)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all participants
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserInfo'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Server error while retrieving participants
 */
router.get(
  "/participants",
  tryCatchWrapper(async (req, res) => {
    const result = await UserInfo.getAllUsers(encryption_key);
    return res.json(result);
  })
);

module.exports = router;
