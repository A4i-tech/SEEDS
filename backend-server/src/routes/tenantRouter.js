const express = require("express");
const tenantAuthProvider = require("../auth/tenant/tenantAuthProviderMiddleware");
const { STATUS } = require("../config/constants");
const authenticateToken = require("../auth/authenticateToken");
const IvrV2Log = require("../models/IvrV2Log");
const { route } = require("..");
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
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: "Both startDate and endDate are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: "Invalid date format",
      });
    }

    // Get tenant_id from authenticated user
    const tenantId = req.user.tenantId;

    // Query IvrV2Log for data in the date range with matching tenant_id
    const analyticsData = await IvrV2Log.find({
      tenant_id: tenantId,
      created_at: {
        $gte: start,
        $lte: end,
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

module.exports = router;
