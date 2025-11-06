const express = require('express');
const tenantAuthProvider = require('../auth/tenant/tenantAuthProviderMiddleware');
const {STATUS} = require("../config/constants");
const authenticateToken = require('../auth/authenticateToken');
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
router.get("/names",
  tenantAuthProvider.getAllTenants
);

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
 *               name:
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
router.post('/login',
  tenantAuthProvider.login,
  (req, res) => {
    // Send a success response with the extracted userId
    res.status(STATUS.OK).json({
      message: 'Login successful',
      userId: req.userId
    });
  }
);

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
router.post('/logout',
  authenticateToken,
  (req, res) => {
    // Acknowledge logout
    res.status(STATUS.OK).json({message: 'Logout successful'});
  }
);

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
 *               name:
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
router.post('/register',
  tenantAuthProvider.register
);

module.exports = router;
