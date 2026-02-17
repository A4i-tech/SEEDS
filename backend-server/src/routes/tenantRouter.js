const express = require("express");
const tenantAuthProvider = require("../auth/tenant/tenantAuthProviderMiddleware");
const contentCreatorAuthProvider = require("../auth/contentCreator/contentCreatorAuthProviderMiddleware");
const { STATUS } = require("../config/constants");
const authenticateToken = require("../auth/authenticateToken");
const IvrV2Log = require("../models/IvrV2Log");
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
router.post("/login", tenantAuthProvider.login, (req, res) => {
  // Send a success response with the extracted userId
  res.status(STATUS.OK).json({
    message: "Login successful",
    userId: req.userId,
  });
});

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
router.post("/analytics", authenticateToken, async (req, res) => {
  try {
    if (req.userRole !== "tenant") {
      return res
        .status(STATUS.FORBIDDEN)
        .json({ message: "Only tenant accounts can access analytics" });
    }

    const { startDate, endDate } = req.body;
    const tenantId = req.tenantId;
    if (!startDate || !endDate) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: "Both startDate and endDate are required",
      });
    }

    if (!tenantId) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: "Tenant ID is required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: "Invalid date format",
      });
    }

    const startStr = start.toISOString();
    const endStr = end.toISOString();

    const analyticsData = await IvrV2Log.find({
      tenant_id: tenantId,
      created_at: {
        $gte: startStr,
        $lte: endStr,
      },
    }).exec();

    res.status(STATUS.OK).json({
      startDate,
      endDate,
      count: analyticsData.length,
      data: analyticsData,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(STATUS.INTERNAL_ERROR).json({
      message: "Error retrieving analytics data",
    });
  }
});

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
  (req, res, next) => {
    if (req.userRole !== "tenant") {
      return res
        .status(STATUS.FORBIDDEN)
        .json({ message: "Only tenant accounts can change tenant password" });
    }
    return tenantAuthProvider.changePassword(req, res, next);
  },
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
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const tenant = await tenantAuthProvider.getTenantById(tenantId);
    if (!tenant) {
      return res.status(STATUS.NOT_FOUND).json({ message: "Tenant not found" });
    }

    if (req.userRole === "content_creator") {
      const creator = await contentCreatorAuthProvider.getContentCreatorById(req.userId);
      if (!creator) {
        return res
          .status(STATUS.NOT_FOUND)
          .json({ message: "Content creator not found" });
      }

      return res.status(STATUS.OK).json({
        email: creator.email,
        name: creator.name,
        role: "content_creator",
        tenantId,
        tenantName: tenant.tenantName,
      });
    }

    return res.status(STATUS.OK).json({
      email: tenant.email,
      tenantName: tenant.tenantName,
      role: "tenant",
      tenantId,
      name: tenant.tenantName,
    });
  } catch (error) {
    console.error("Get tenant error:", error);
    return res
      .status(STATUS.INTERNAL_ERROR)
      .json({ message: "Internal server error" });
  }
});

module.exports = router;
