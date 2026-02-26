"use strict";
const { STATUS } = require("../config/constants");
const express = require("express");
const Teacher = require("../models/Teacher.js");
const Student = require("../models/Student.js");
const authenticateToken = require("../auth/authenticateToken");
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
router.post("/students", authenticateToken, async (req, res) => {
  const teacher = await Teacher.findOne({ phoneNumber: req.body.phoneNumber });
  if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);
  const studentIds = Array.isArray(teacher.studentId) ? teacher.studentId : [];
  const students =
    studentIds.length > 0
      ? await Student.find({ _id: { $in: studentIds } }, "name phoneNumber").lean()
      : [];
  const results = students.map((student) => ({
    name: student.name,
    phoneNumber: student.phoneNumber,
  }));
  return res.json(results);
});

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
router.get("/teachers", authenticateToken, async (req, res) => {
  const tenantId = req.userId;
  if (!tenantId) return res.sendStatus(STATUS.BAD_REQUEST);
  console.log("Fetching teachers for tenantId:", tenantId);
  try {
    const teachers = await Teacher.find({ tenantId }, "_id name phoneNumber studentId").lean();

    if (!teachers || teachers.length === 0) return res.json([]);

    // collect unique student ids
    const studentIdSet = new Set();
    for (const t of teachers) {
      if (Array.isArray(t.studentId)) {
        for (const sid of t.studentId) {
          if (sid) studentIdSet.add(String(sid));
        }
      }
    }

    const studentIds = Array.from(studentIdSet);

    // single query for all referenced students
    const students =
      studentIds.length > 0
        ? await Student.find({ _id: { $in: studentIds } }, "name phoneNumber").lean()
        : [];

    const studentMap = {};
    for (const s of students) {
      studentMap[String(s._id)] = s;
    }

    const results = teachers.map((t) => ({
      _id: t._id,
      name: t.name,
      phoneNumber: t.phoneNumber,
      students: (t.studentId || [])
        .map((id) => {
          const s = studentMap[String(id)];
          return s ? { name: s.name, phoneNumber: s.phoneNumber } : null;
        })
        .filter(Boolean),
    }));

    return res.json(results);
  } catch (err) {
    console.error("Error fetching teachers by tenantId:", err);
    return res.sendStatus(STATUS.INTERNAL_ERROR);
  }
});

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
router.post("/add-students", authenticateToken, async (req, res) => {
  if (!Array.isArray(req.body.students) || req.body.students.length === 0) {
    return res.sendStatus(STATUS.BAD_REQUEST);
  }
  const teacher = await Teacher.findOne({ phoneNumber: req.body.phoneNumber });
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
 * @swagger
 * /teacher/students:
 *   post:
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
 *               - remove
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
 *                 description: Array of student objects with phone numbers to remove
 *               remove:
 *                 type: boolean
 *                 description: Flag indicating removal operation
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
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Teacher not found
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.delete("/students", authenticateToken, async (req, res) => {
  if (!Array.isArray(req.body.students) || req.body.students.length === 0) {
    return res.sendStatus(STATUS.BAD_REQUEST);
  }

  const teacher = await Teacher.findOne({ phoneNumber: req.body.phoneNumber });
  if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);

  let removedCount = 0;

  for (let i = 0; i < req.body.students.length; i++) {
    const studentPhoneNumber = req.body.students[i].phoneNumber;
    if (!studentPhoneNumber) continue;

    const student = await Student.findOne({ phoneNumber: studentPhoneNumber });
    if (student) {
      await Teacher.updateOne(
        { _id: teacher._id },
        { $pull: { studentId: student._id.toString() } }
      );
      removedCount++;
    }
  }

  return res.status(STATUS.OK).json({
    message: "Students removed successfully",
    removedCount: removedCount,
  });
});

module.exports = router;
