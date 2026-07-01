const express = require("express");
const tenantAuthProvider = require("../auth/tenant/tenantAuthProviderMiddleware");
const { authenticateToken, authorizeRole } = require("../auth/authenticateToken");
const tenantController = require("../controllers/tenant.controller");
const analyticsController = require("../controllers/analytics.controller");
const tenantService = require("../services/tenant.service");
const { STATUS } = require("../config/constants");
const TENANT_ROLE = "tenant";
/**
 *  @swagger
 * tags:
 *   name: Tenant
 *   description: Tenant authentication and registration endpoints
 */
const router = express.Router();

/**
 * @swagger
 * /tenant/names:
 *   get:
 *     summary: Get all tenant names
 *     tags: [Tenant]
 *     responses:
 *       200:
 *         description: List of tenant names
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 */
router.get("/names", tenantAuthProvider.getAllTenants);

/**
 * @swagger
 * /tenant/login:
 *   post:
 *     summary: Tenant login
 *     tags: [Tenant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *             required:
 *               - email
 *               - password
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
router.post("/login", tenantAuthProvider.login);

/**
 * @swagger
 * /tenant/logout:
 *   post:
 *     summary: Tenant logout
 *     tags: [Tenant]
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
  // Acknowledge logout
  res.status(STATUS.OK).json({ message: "Logout successful" });
});

/**
 * @swagger
 * /tenant/register:
 *   post:
 *     summary: Register a new tenant (native only)
 *     tags:
 *       - Tenant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: Tenant's email address
 *               password:
 *                 type: string
 *                 description: Tenant's password
 *               tenantName:
 *                 type: string
 *                 description: Tenant's name
 *             required:
 *               - email
 *               - password
 *               - name
 *     responses:
 *       201:
 *         description: Tenant registered successfully
 *       400:
 *         description: Bad request, missing or invalid fields
 *       409:
 *         description: Conflict, email already exists
 */
router.post("/register", tenantAuthProvider.register);

/**
 * @swagger
 * /tenant/analytics:
 *   post:
 *     summary: Get analytics data for a date range
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Start of date range
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: End of date range
 *             required:
 *               - startDate
 *               - endDate
 *     responses:
 *       200:
 *         description: Analytics data for the specified date range
 *       400:
 *         description: Missing or invalid date range
 *       401:
 *         description: Unauthorized
 */
router.post("/analytics", authenticateToken, authorizeRole(TENANT_ROLE), tenantController.getAnalytics);

/**
 * @swagger
 * /tenant/analytics/ivr:
 *   get:
 *     summary: IVR usage analytics for a date range (Tenant only)
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: schoolId
 *         schema: { type: string }
 *       - in: query
 *         name: teacherId
 *         schema: { type: string }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv] }
 *       - in: query
 *         name: section
 *         schema: { type: string, enum: [calls, byTeacher, bySchool, contentUsage] }
 *         description: CSV section to export (used with format=csv)
 *     responses:
 *       200:
 *         description: IVR analytics (JSON metrics or CSV export)
 *       400:
 *         description: Missing or invalid parameters
 *       401:
 *         description: Unauthorized
 */
router.get(
    "/analytics/ivr",
    authenticateToken,
    authorizeRole(TENANT_ROLE),
    analyticsController.getIvrAnalytics
);

/**
 * @swagger
 * /tenant/analytics/conference:
 *   get:
 *     summary: Conference usage analytics for a date range (Tenant only)
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: schoolId
 *         schema: { type: string }
 *       - in: query
 *         name: teacherId
 *         schema: { type: string }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv] }
 *       - in: query
 *         name: section
 *         schema: { type: string, enum: [conferences, byTeacher] }
 *         description: CSV section to export (used with format=csv)
 *     responses:
 *       200:
 *         description: Conference analytics (JSON metrics or CSV export)
 *       400:
 *         description: Missing or invalid parameters
 *       401:
 *         description: Unauthorized
 */
router.get(
    "/analytics/conference",
    authenticateToken,
    authorizeRole(TENANT_ROLE),
    analyticsController.getConferenceAnalytics
);

/**
 * @swagger
 * /tenant/change-password:
 *   post:
 *     summary: Change tenant password
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *                 description: New password (must meet policy)
 *             required:
 *               - newPassword
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Missing fields or weak/old password
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tenant not found
 */
router.post(
  "/change-password",
  authenticateToken,
  authorizeRole(TENANT_ROLE),
  tenantAuthProvider.changePassword,
);

/**
 * @swagger
 * /tenant/me:
 *   get:
 *     summary: Get tenant details by ID
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 tenantName:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tenant not found
 *       500:
 *         description: Internal server error
 */
router.get("/me", authenticateToken, authorizeRole(TENANT_ROLE), tenantController.getMe);

/**
 * @swagger
 * /tenant/dashboard:
 *   get:
 *     summary: Get tenant dashboard statistics
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics with per-school breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     totalSchools:
 *                       type: integer
 *                     totalTeachers:
 *                       type: integer
 *                     totalStudents:
 *                       type: integer
 *                     totalClasses:
 *                       type: integer
 *                 schools:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/dashboard", authenticateToken, authorizeRole(TENANT_ROLE), tenantService.getDashboard);

module.exports = router;
