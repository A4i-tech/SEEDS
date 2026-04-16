"use strict";
const { STATUS } = require("../config/constants");
const express = require("express");
const Teacher = require("../models/Teacher.js");
const Student = require("../models/Student.js");
const { authenticateToken, authorizeRole } = require("../auth/authenticateToken");
const teacherController = require("../controllers/teacher.controller");
/**
 * @swagger
 * tags:
 *   name: Teachers
 *   description: Teacher management endpoints
 */
const router = express.Router();
const TENANT_ROLE = "tenant";
const SCHOOL_ADMIN_ROLE = "school_admin";
const TEACHER_ROLE = "teacher";
const CONTENT_CREATOR_ROLE = "content_creator";

/**
 * @swagger
 * /v1/teacher/students:
 *   post:
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
router.post(
  "/students",
  authenticateToken,
  authorizeRole(TEACHER_ROLE, CONTENT_CREATOR_ROLE),
  async (req, res) => {
    try {
      const teacherId = req.userId;
      const tenantId = req.tenantId;
      const teacher = await Teacher.findOne({ _id: teacherId, tenantId });
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
    } catch (err) {
      console.error("Error fetching teacher students:", err);
      return res.sendStatus(STATUS.INTERNAL_ERROR);
    }
  },
);

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
router.get("/teachers", authenticateToken, authorizeRole(TENANT_ROLE), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return res.sendStatus(STATUS.BAD_REQUEST);
  try {
    const teachers = await Teacher.find(
      { tenantId },
      "_id name phoneNumber role studentId",
    ).lean();

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
      role: t.role,
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
 *                     name:
 *                       type: string
 *                     phoneNumber:
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
 *                   phoneNumber:
 *                     type: string
 *                 description: Student object
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.post(
  "/add-students",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE),
  teacherController.addStudents
);

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
router.delete(
  "/students",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE),
  teacherController.removeStudents
);

router.patch(
  "/students",
  authenticateToken,
  authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE),
  teacherController.updateStudent
);

module.exports = router;
