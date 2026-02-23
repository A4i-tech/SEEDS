"use strict";
const { STATUS } = require("../config/constants");
const express = require("express");
const Teacher = require("../models/Teacher.js");
const Student = require("../models/Student.js");
const authenticateToken = require("../auth/authenticateToken");
const teacherAuthProvider = require("../auth/teacher/teacherAuthProviderMiddleware");
/**
 * @swagger
 * tags:
 *   name: Teachers
 *   description: Teacher management endpoints
 */
const router = express.Router();

/**
 * @swagger
 * /teacher/add-students:
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
router.post("/add-students", authenticateToken, async (req, res) => {
  if (!Array.isArray(req.body.students) || req.body.students.length === 0) {
    return res.sendStatus(STATUS.BAD_REQUEST);
  }
  const tenantId = req.tenantId;
  const teacher = await Teacher.findOne({ phoneNumber: req.body.phoneNumber, tenantId });
  if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);
  let results = [];

  for (let i = 0; i < req.body.students.length; i++) {
    const studentData = req.body.students[i];
    if (!studentData.name || !studentData.phoneNumber) {
      continue;
    }
    const studentExists = await Student.findOne({
      phoneNumber: studentData.phoneNumber,
    });
    if (studentExists) {
      continue;
    }
    const student = await Student.create(req.body.students[i]);
    const studentId = student._id.toString();
    await Teacher.updateOne({ _id: teacher._id }, { $addToSet: { studentId: studentId } });
    results.push({
      name: student.name,
      phoneNumber: student.phoneNumber,
    });
  }
  return res.status(STATUS.OK).json(results);
});

/**
 *  @swagger
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
 *               tenantName:
 *                 type: string
 *             required:
 *               - phoneNumber
 *               - password
 *               - tenantName
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
 *     summary: Register or retrieve teacher information
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Teacher information retrieved or created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Teacher'
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.post("/register", authenticateToken, teacherAuthProvider.register);

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
router.post("/logout", authenticateToken, (req, res) => {
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

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const teacherId = req.userId;
    const teacher = await Teacher.findById(teacherId).select("phoneNumber").lean();
    if (!teacher) {
      return res.sendStatus(STATUS.NOT_FOUND);
    }
    res.status(STATUS.OK).json({ phoneNumber: teacher.phoneNumber });
  } catch (err) {
    console.error("Error fetching teacher profile", err);
    res.sendStatus(STATUS.INTERNAL_ERROR);
  }
});

module.exports = router;
