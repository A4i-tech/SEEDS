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
  try {
    const { students, phoneNumber } = req.body;

    if (!Array.isArray(students) || !students.length)
      return res.sendStatus(STATUS.BAD_REQUEST);

    const teacher = await Teacher.findOne({ phoneNumber });
    if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);

    const validStudents = students
      .filter(s => s?.name && s?.phoneNumber)
      .map(s => ({
        ...s,
        name: s.name.trim(),
        phoneNumber: s.phoneNumber.trim()
      }))
      .filter(s => s.name && s.phoneNumber);

    if (!validStudents.length)
      return res.sendStatus(STATUS.BAD_REQUEST);

    const phoneNumbers = validStudents.map(s => s.phoneNumber);

    const existingStudents = await Student.find({
      phoneNumber: { $in: phoneNumbers }
    });

    const existingMap = new Map(
      existingStudents.map(s => [s.phoneNumber, s])
    );

    const duplicates = [];
    const bulkUpdates = [];
    const studentsToAdd = [];
    const newStudentsData = [];

    for (const s of validStudents) {
      const existing = existingMap.get(s.phoneNumber);

      if (existing) {
        if (s.updateName && existing.name !== s.name) {
          bulkUpdates.push({
            updateOne: {
              filter: { _id: existing._id },
              update: { $set: { name: s.name } }
            }
          });
          studentsToAdd.push({ ...existing.toObject(), name: s.name });
        } else if (existing.name === s.name) {
          studentsToAdd.push(existing);
        } else {
          duplicates.push({
            phoneNumber: s.phoneNumber,
            existingName: existing.name,
            submittedName: s.name
          });
        }
      } else {
        newStudentsData.push(s);
      }
    }

    if (bulkUpdates.length)
      await Student.bulkWrite(bulkUpdates);

    let newStudents = [];
    if (newStudentsData.length) {
      try {
        newStudents = await Student.insertMany(newStudentsData, { ordered: false });
      } catch (err) {
        if (err.code === 11000) {
          const attemptedPhones = newStudentsData.map(s => s.phoneNumber);
          newStudents = await Student.find({ phoneNumber: { $in: attemptedPhones } }).lean();
        } else {
          throw err;
        }
      }
    }

    const allStudents = [...studentsToAdd, ...newStudents];
    const allStudentIds = allStudents.map(s => s._id);

    const teacherStudentIdSet = new Set(
      (Array.isArray(teacher.studentId) ? teacher.studentId : [])
        .map(id => String(id))
    );
    const newToTeacherIds = allStudentIds.filter(id => !teacherStudentIdSet.has(String(id)));
    const alreadyLinkedToTeacher = allStudents.filter(s =>
      teacherStudentIdSet.has(String(s._id))
    );

    if (newToTeacherIds.length) {
      await Teacher.updateOne(
        { _id: teacher._id },
        { $addToSet: { studentId: { $each: newToTeacherIds } } }
      );
    }

    const newlyAdded = allStudents.filter(s => !teacherStudentIdSet.has(String(s._id)));
    const payload = {
      students: newlyAdded.map(s => ({
        name: s.name,
        phoneNumber: s.phoneNumber
      }))
    };

    if (duplicates.length)
      payload.duplicates = duplicates;
    if (alreadyLinkedToTeacher.length)
      payload.alreadyLinked = alreadyLinkedToTeacher.map(s => ({
        name: s.name,
        phoneNumber: s.phoneNumber
      }));

    return res.status(STATUS.OK).json(payload);
  } catch (error) {
    console.error(error);
    return res.sendStatus(STATUS.INTERNAL_ERROR);
  }
});


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
router.patch("/students", authenticateToken, async (req, res) => {
  try {
    const { phoneNumber: teacherPhoneNumber, currentPhoneNumber, name, studentPhoneNumber } = req.body;

    if (!teacherPhoneNumber || !currentPhoneNumber || !name || !studentPhoneNumber) {
      return res.sendStatus(STATUS.BAD_REQUEST);
    }

    const teacher = await Teacher.findOne({ phoneNumber: teacherPhoneNumber });
    if (!teacher) return res.sendStatus(STATUS.NOT_FOUND);

    const student = await Student.findOne({ phoneNumber: currentPhoneNumber });
    if (!student) return res.sendStatus(STATUS.NOT_FOUND);

    const ownsStudent = (teacher.studentId || []).some(id => String(id) === String(student._id));
    if (!ownsStudent) return res.sendStatus(STATUS.FORBIDDEN);

    const newPhone = studentPhoneNumber.trim();
    const newName = name.trim();
    if (!newName || !newPhone) {
      return res.sendStatus(STATUS.BAD_REQUEST);
    }

    if (newPhone !== currentPhoneNumber) {
      const existingWithPhone = await Student.findOne({ phoneNumber: newPhone });
      if (existingWithPhone && String(existingWithPhone._id) !== String(student._id)) {
        return res.status(STATUS.CONFLICT).json({
          message: "A phone number already exists",
        });
      }
    }

    student.name = newName;
    student.phoneNumber = newPhone;
    await student.save();

    return res.status(STATUS.OK).json({
      name: student.name,
      phoneNumber: student.phoneNumber,
    });
  } catch (error) {
    console.error("PATCH /students error:", error);
    return res.sendStatus(STATUS.INTERNAL_ERROR);
  }
});

module.exports = router;
