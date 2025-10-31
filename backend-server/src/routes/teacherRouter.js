"use strict";
const {STATUS} = require("../config/constants");
const express = require("express");
const {getTeacherByPhoneNumber,setStudentsByPhoneNumber} = require("../models/Teacher.js");

/**
 * @swagger
 * tags:
 *   name: Teachers
 *   description: Teacher management endpoints
 */
const router = express.Router();
/**
 * @swagger
 * /teacher/students:
 *   get:
 *     summary: Get all students for the current teacher
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of students
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
 *       404:
 *         description: Teacher not found
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.get("/students", async (req, res) => {
  const teacher = await getTeacherByPhoneNumber(req.body.phoneNumber);
  if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);
  return res.json(teacher.students);
})

/**
 * @swagger
 * /teacher/students:
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
router.post("/students", async (req, res) => {
  const teacher = await setStudentsByPhoneNumber(req.body.phoneNumber, req.body.students);
  return res.json(teacher.students);
})

module.exports = router
