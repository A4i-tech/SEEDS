"use strict";
const express = require("express");
const path = require("path");
const Teacher = require("../models/Teacher.js");
const { tryCatchWrapper } = require(path.join("..", "util.js"));

/**
 * @swagger
 * tags:
 *   name: Teachers
 *   description: Teacher management endpoints
 */
const router = express.Router();

/**
 * @swagger
 * /teacher/register:
 *   get:
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
router.get("/register", tryCatchWrapper(async (req, res) => {

    var teacher = await Teacher.findOne({ email: req.user?.email || req.userId });
    if (!teacher) {
        teacher = new Teacher({
            email: req.user?.email || req.userId,
            students: []
        });
        await teacher.save();
    }
    return res.json(teacher);
}))

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
 *                 type: string
 *                 description: Student ID
 *       404:
 *         description: Teacher not found
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.get("/students", tryCatchWrapper (async (req, res) => {
    var teacher = await Teacher.getTeacherById(req.userId);
    if(!teacher)  return res.sendStatus(404);
    return res.json(teacher.students)
}))

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
 *                   type: string
 *                 description: Array of student IDs
 *     responses:
 *       200:
 *         description: Updated list of students
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 description: Student ID
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.post("/students", tryCatchWrapper(async (req, res) => {
    var teacher = await Teacher.setStudentsByTeacherId(req.userId, req.body.students);
    return res.json(teacher.students);
}))

module.exports = router
