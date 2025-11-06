"use strict";
const {STATUS} = require("../config/constants");
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
 * /teacher/get-students:
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
router.post("/get-students",
  authenticateToken,
  async (req, res) => {
    const teacher = await Teacher.findOne({phoneNumber: req.body.phoneNumber});
    if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);
    let results = [];
    for (let i = 0; i < teacher.studentId.length; i++) {
      const student = await Student.findById(teacher.studentId[i]);
      if (student) {
        results.push({
          name: student.name,
          phoneNumber: student.phoneNumber
        });
      }
    }
    return res.json(results);
  }
);

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
router.post("/add-students",
  authenticateToken,
  async (req, res) => {
    if(!Array.isArray(req.body.students) || req.body.students.length === 0) {
      return res.sendStatus(STATUS.BAD_REQUEST);
    }
    const teacher = await Teacher.findOne({phoneNumber: req.body.phoneNumber});
    if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);
    let results = [];

    for(let i = 0; i < req.body.students.length; i++) {
      const studentData = req.body.students[i];
      if(!studentData.name || !studentData.phoneNumber) {
        continue;
      }
      const studentExists = await Student.findOne({phoneNumber: studentData.phoneNumber});
      if(studentExists) {
        continue;
      }
      const student = await Student.create(req.body.students[i]);
      const studentId = student._id.toString();
      await Teacher.updateOne(
        {_id: teacher._id},
        { $addToSet: { studentId: studentId } }
      );
      results.push({
        name: student.name,
        phoneNumber: student.phoneNumber
      });
    }
    return res.status(STATUS.OK).json(results);
  }
);

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
router.post('/login',
  teacherAuthProvider.login
);

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
router.post('/register',
  teacherAuthProvider.register
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
router.post('/logout',
  authenticateToken,
  (req, res) => {
    res.status(STATUS.OK).json({message: 'Logout successful'});
  }
);

module.exports = router
