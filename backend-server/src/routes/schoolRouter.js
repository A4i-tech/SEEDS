"use strict";
const express = require("express");
const { authenticateToken, authorizeRole } = require("../auth/authenticateToken");
const schoolController = require("../controllers/school.controller");
const schoolAdminAuthProvider = require("../auth/schoolAdmin/schoolAdminAuthProviderMiddleware");
const teacherController = require("../controllers/teacher.controller");
const router = express.Router();

const TENANT_ROLE = "tenant";
const SCHOOL_ADMIN_ROLE = "school_admin";

/**
 * @swagger
 * /school/admin/login:
 *   post:
 *     summary: School admin login
 *     tags: [School]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
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
 *                 schoolId:
 *                   type: string
 *                 schoolName:
 *                   type: string
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Invalid credentials
 */
router.post("/admin/login", schoolAdminAuthProvider.login);

/**
 * @swagger
 * /school/admin/me:
 *   get:
 *     summary: Get current school admin profile
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: School admin profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 schoolId:
 *                   type: string
 *                 tenantId:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: School admin not found
 */
router.get(
  "/admin/me",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  schoolAdminAuthProvider.getMe
);

/**
 * @swagger
 * /school:
 *   post:
 *     summary: Create a new school
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: School created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 tenantId:
 *                   type: string
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.post("/", authenticateToken, authorizeRole(TENANT_ROLE), schoolController.createSchool);

/**
 * @swagger
 * /school:
 *   get:
 *     summary: Get all schools for the current tenant
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of schools
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/School'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticateToken, authorizeRole(TENANT_ROLE, SCHOOL_ADMIN_ROLE), schoolController.getSchools);

/**
 * @swagger
 * /school/teachers:
 *   get:
 *     summary: Get all teachers in the admin's school (School Admin only)
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teachers in the school
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: School not found
 */
router.get(
  "/teachers",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.getTeachersBySchool
);

/**
 * @swagger
 * /school/transfer:
 *   post:
 *     summary: Transfer a teacher to another school within the same tenant (School Admin only)
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - teacherId
 *               - targetSchoolId
 *             properties:
 *               teacherId:
 *                 type: string
 *               targetSchoolId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Teacher transferred successfully
 *       400:
 *         description: Missing fields or invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Teacher or target school not found
 */
router.post(
  "/transfer",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  teacherController.transferTeacher
);

/**
 * @swagger
 * /school/dashboard:
 *   get:
 *     summary: Get dashboard for the admin's school (School Admin only)
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: School dashboard
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: School not found
 */
router.get(
  "/dashboard",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  schoolController.getSchoolDashboard
);

/**
 * @swagger
 * /school/analytics:
 *   post:
 *     summary: Get analytics for the admin's school (School Admin only)
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Analytics data for the specified date range
 *       400:
 *         description: Missing or invalid date range
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/analytics",
  authenticateToken,
  authorizeRole(SCHOOL_ADMIN_ROLE),
  schoolController.getSchoolAnalytics
);

/**
 * @swagger
 * /school/{schoolId}:
 *   get:
 *     summary: Get a school by ID
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema:
 *           type: string
 *         description: School ID
 *     responses:
 *       200:
 *         description: School details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/School'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: School not found
 *       500:
 *         description: Internal server error
 */
router.get("/:schoolId", authenticateToken, authorizeRole(TENANT_ROLE), schoolController.getSchoolById);

/**
 * @swagger
 * /school:
 *   patch:
 *     summary: Update a school
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: School updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/School'
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: School not found
 *       500:
 *         description: Internal server error
 */
router.patch("/", authenticateToken, authorizeRole(SCHOOL_ADMIN_ROLE), schoolAdminAuthProvider.update);

/**
 * @swagger
 * /school/{schoolId}:
 *   delete:
 *     summary: Delete a school
 *     tags: [School]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema:
 *           type: string
 *         description: School ID
 *     responses:
 *       200:
 *         description: School deleted successfully
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: School not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:schoolId", authenticateToken, authorizeRole(TENANT_ROLE), schoolController.deleteSchool);


module.exports = router;
