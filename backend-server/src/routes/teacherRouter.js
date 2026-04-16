"use strict";

const express = require("express");
const { authenticateToken, authorizeRole } = require("../auth/authenticateToken");
const teacherAuthProvider = require("../auth/teacher/teacherAuthProviderMiddleware");
const teacherController = require("../controllers/teacher.controller");
const { STATUS } = require("../config/constants");

/**
 * @swagger
 * tags:
 *   name: Teachers
 *   description: Teacher management endpoints
 */

const router = express.Router();

const TEACHER_ROLE = "teacher";
const CONTENT_CREATOR_ROLE = "content_creator";
const SCHOOL_ADMIN_ROLE = "school_admin";

/**
 * @swagger
 * /teacher/login:
 *   post:
 *     summary: Teacher login
 *     tags: [Teachers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *               schoolId:
 *                 type: string
 *                 description: Optional school identifier to scope login
 *             required:
 *               - phoneNumber
 *               - password
 *     responses:
 *       200:
 *         description: Successful login, returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", teacherAuthProvider.login);

/**
 * @swagger
 * /teacher/register:
 *   post:
 *     summary: Register a new teacher
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - password
 *               - name
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [teacher, content_creator]
 *     responses:
 *       201:
 *         description: Teacher registered successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       409:
 *         description: Phone number already in use
 */
router.post(
  "/register",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.register
);

/**
 * @swagger
 * /teacher/logout:
 *   post:
 *     summary: Teacher logout
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logout successful
 *       401:
 *         description: Unauthorized, token is missing or invalid
 */
router.post(
  "/logout",
  authenticateToken,
  authorizeRole(TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  (req, res) => {
    res.status(STATUS.OK).json({ message: "Logout successful" });
  }
);

/**
 * @swagger
 * /teacher/me:
 *   get:
 *     summary: Get current teacher information
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current teacher information
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: Teacher not found
 */
router.get(
  "/me",
  authenticateToken,
  authorizeRole(TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  teacherController.getMe
);

router.get(
  "/teachers",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.getTeachersBySchool
);

router.patch(
  "/:teacherId",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.update
);

router.delete(
  "/:teacherId",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.delete
);

module.exports = router;
