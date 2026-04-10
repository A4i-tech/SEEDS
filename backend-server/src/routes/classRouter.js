"use strict";
const express = require("express");
const path = require("path");
const ClassRoom = require("../models/Class.js");
const Student = require("../models/Student.js");
const { tryCatchWrapper } = require(path.join("..", "util.js"));

/**
 * Given an array of phone number strings, resolve them to Student _id ObjectIds.
 * Values with no matching student are dropped.
 */
async function resolveStudentIds(phones, schoolId) {
  if (!phones || phones.length === 0) return [];
  const found = await Student.find({ phoneNumber: { $in: phones }, schoolId }).select("_id phoneNumber").lean();
  const phoneToId = {};
  found.forEach((s) => { phoneToId[s.phoneNumber] = s._id; });
  return phones.map((p) => phoneToId[p]).filter(Boolean);
}

/**
 * @swagger
 * tags:
 *   name: Classes
 *   description: Class management endpoints
 */
const router = express.Router();

/**
 * @swagger
 * /class:
 *   get:
 *     summary: Get all classes for the current teacher
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of classes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ClassRoom'
 */

router.get(
  "/",
  tryCatchWrapper(async (req, res) => {
    return res.json(await ClassRoom.getClassesByTeacherId(req.userId));
  })
);

/**
 * @swagger
 * /class/{classId}:
 *   get:
 *     summary: Get a class by ID
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     responses:
 *       200:
 *         description: Class details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClassRoom'
 *       404:
 *         description: Class not found
 */
router.get(
  "/:classId",
  tryCatchWrapper(async (req, res) => {
    return res.json(await ClassRoom.getClassById(req.params.classId));
  })
);

/**
 * @swagger
 * /class:
 *   post:
 *     summary: Create or update a class
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClassRoomInput'
 *     responses:
 *       200:
 *         description: Class created or updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClassRoom'
 *       403:
 *         description: Forbidden - Not authorized to update this class
 */
router.post(
  "/",
  tryCatchWrapper(async (req, res) => {
    req.body.teacher = req.userId;
    req.body.schoolId = req.schoolId;

    // Resolve phone number strings → Student ObjectIds (AI sends phone numbers)
    if (Array.isArray(req.body.students)) {
      req.body.students = await resolveStudentIds(req.body.students, req.schoolId);
    }
    if (Array.isArray(req.body.leaders)) {
      req.body.leaders = await resolveStudentIds(req.body.leaders, req.schoolId);
    }

    var classRoom;
    if (req.body._id) {
      classRoom = await ClassRoom.getClassById(req.body._id);
      if (classRoom.teacher !== req.userId) return res.json(403);
      ["name", "students", "leaders", "contentIds"].forEach(
        (prop) => (classRoom[prop] = req.body[prop])
      );
    } else {
      classRoom = new ClassRoom(req.body);
    }
    await classRoom.save();
    await classRoom.populate("students", "name phoneNumber");
    await classRoom.populate("leaders", "name phoneNumber");
    return res.json(classRoom);
  })
);

/**
 * @swagger
 * /class/{classId}:
 *   delete:
 *     summary: Delete a class
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID to delete
 *     responses:
 *       200:
 *         description: Class deleted successfully
 *       404:
 *         description: Class not found
 */
router.delete(
  "/:classId",
  tryCatchWrapper(async (req, res) => {
    await ClassRoom.deleteClassById(req.params.classId);
    return res.sendStatus(200);
  })
);

module.exports = router;
