"use strict";

const express = require("express");
const { authenticateToken, authorizeRole } = require("../auth/authenticateToken");
const studentController = require("../controllers/student.controller");

/**
 * @swagger
 * tags:
 *   name: Students
 *   description: Student management endpoints
 */

const SCHOOL_ADMIN_ROLE = "school_admin";
const TEACHER_ROLE = "teacher";
const CONTENT_CREATOR_ROLE = "content_creator";

const router = express.Router();

/**
 * @swagger
 * /student:
 *   post:
 *     summary: Add a student to the admin's school
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phoneNumber
 *             properties:
 *               name:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: Student created successfully
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Phone number already in use in this school
 */
router.post("/",authenticateToken, authorizeRole(SCHOOL_ADMIN_ROLE), studentController.createStudent);

/**
 * @swagger
 * /student:
 *   get:
 *     summary: List all students in the admin's school
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of students
 *       401:
 *         description: Unauthorized
 */
router.get("/",authenticateToken, authorizeRole(SCHOOL_ADMIN_ROLE, TEACHER_ROLE, CONTENT_CREATOR_ROLE), studentController.getStudents);

/**
 * @swagger
 * /student/{studentId}:
 *   patch:
 *     summary: Update a student in the admin's school
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
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
 *     responses:
 *       200:
 *         description: Student updated successfully
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Student not found
 *       409:
 *         description: Phone number already in use in this school
 */
router.patch("/:studentId",authenticateToken, authorizeRole(SCHOOL_ADMIN_ROLE), studentController.updateStudent);

/**
 * @swagger
 * /student/{studentId}:
 *   delete:
 *     summary: Delete a student from the admin's school
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Student not found
 */
router.delete("/:studentId",authenticateToken, authorizeRole(SCHOOL_ADMIN_ROLE), studentController.deleteStudent);

module.exports = router;
