"use strict";
const express = require("express");
const authenticateToken = require("../auth/authenticateToken");
const teacherController = require("../controllers/teacher.controller");

/**
 * @swagger
 * tags:
 *   name: Teachers
 *   description: Teacher management endpoints
 */
const router = express.Router();

/**
 * @swagger
 * /v1/teacher/students:
 *   get:
 *     summary: Get all students for the current teacher
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of students and their phone numbers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   phoneNumber:
 *                     type: string
 *                 description: Student object
 *       404:
 *         description: Teacher not found
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.post("/students", authenticateToken, teacherController.getStudents);

/**
 * @swagger
 * /v1/teacher/teachers:
 *   get:
 *     summary: Get teachers for a tenant
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teachers for the tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   phoneNumber:
 *                     type: string
 *                   students:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         phoneNumber:
 *                           type: string
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get("/teachers", authenticateToken, teacherController.getTeachers);

/**
 * @swagger
 * /v1/teacher/add-students:
 *   post:
 *     summary: Update teacher's students list
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
 *               - students
 *             properties:
 *               students:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     phone_number:
 *                       type: string
 *                 description: Array of student objects
 *     responses:
 *       200:
 *         description: Updated list of students
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   phone_number:
 *                     type: string
 *                 description: Student object
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.post("/add-students", authenticateToken, teacherController.addStudents);

/**
 * @swagger
 * /v1/teacher/students:
 *   delete:
 *     summary: Remove students from teacher's list
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
 *               - students
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Teacher's phone number
 *               students:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     phoneNumber:
 *                       type: string
 *                       description: Student phone number to remove
 *                 description: Array of student objects with phone numbers to remove
 *     responses:
 *       200:
 *         description: Students successfully removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Students removed successfully
 *                 removedCount:
 *                   type: number
 *                   description: Number of students removed
 *       400:
 *         description: Invalid request body (e.g. missing or empty students array)
 *       404:
 *         description: Teacher not found
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.delete("/students", authenticateToken, teacherController.removeStudents);

/**
 * @swagger
 * /v1/teacher/students:
 *   patch:
 *     summary: Update a student's name and/or phone number
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
 *               - currentPhoneNumber
 *               - name
 *               - studentPhoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Teacher's phone number
 *               currentPhoneNumber:
 *                 type: string
 *                 description: Current phone number of the student to update
 *               name:
 *                 type: string
 *                 description: New name
 *               studentPhoneNumber:
 *                 type: string
 *                 description: New phone number for the student
 *     responses:
 *       200:
 *         description: Student updated successfully
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Teacher or student not found
 *       403:
 *         description: Student does not belong to this teacher
 *       409:
 *         description: A student with that phone number already exists
 *       401:
 *         description: Unauthorized
 */
router.patch("/students", authenticateToken, teacherController.updateStudent);

module.exports = router;
