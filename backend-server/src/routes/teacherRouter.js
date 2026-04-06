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
 *             required:
 *               - phoneNumber
 *               - password
 *               - schoolId
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *               schoolId:
 *                 type: string
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
router.post("/logout", authenticateToken, authorizeRole(TEACHER_ROLE), (req, res) => {
  res.status(STATUS.OK).json({ message: "Logout successful" });
});

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phoneNumber:
 *                   type: string
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: Teacher not found
 */
router.get("/me", authenticateToken, authorizeRole(TEACHER_ROLE), teacherController.getMe);

/**
 * @swagger
 * /teacher/teachers:
 *   get:
 *     summary: Get all teachers in the admin's school (School Admin only)
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teachers in the school
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: School not found
 */
router.get(
  "/teachers",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.getTeachersBySchool
);

/**
 * @swagger
 * /teacher/{teacherId}:
 *   patch:
 *     summary: Update a teacher's name, phone number, or password (School Admin only)
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Teacher updated successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Teacher not found
 *       409:
 *         description: Phone number already in use in this school
 */
router.patch(
  "/:teacherId",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.update
);

/**
 * @swagger
 * /teacher/{teacherId}:
 *   delete:
 *     summary: Delete a teacher from the admin's school (School Admin only)
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Teacher deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Teacher not found
 */
router.delete(
  "/:teacherId",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.delete
);

module.exports = router;
