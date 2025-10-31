const express = require('express');
const tenantAuthProvider = require('../auth/tenant/tenantAuthProviderMiddleware');
const {STATUS} = require("../config/constants");
const router = express.Router();
const authenticateToken = require('../auth/authenticateToken');
const teacherAuthProvider = require("../auth/teacher/teacherAuthProviderMiddleware");

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
router.post('/register', [
  (req, res, next) => {
    if (!tenantAuthProvider.supportsRegistration()) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Registration is managed externally.'});
    }
    next();
  },
  tenantAuthProvider.register
]);

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
router.post('/teacher/login',
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
router.post('/teacher/register',
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
router.post('/teacher/logout',
  authenticateToken,
  (req, res) => {
    res.status(STATUS.OK).json({message: 'Logout successful'});
  });

module.exports = router;
