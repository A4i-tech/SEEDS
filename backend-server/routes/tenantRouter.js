const express = require('express');
const authProvider = require('../auth/authProviderMiddleware');

const STATUS_BAD_REQUEST = 400;
const STATUS_OK = 200;

const router = express.Router();

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
    authProvider.login,
    (req, res) => {
        // Send a success response with the extracted userId
        res.status(STATUS_OK).json({
            message: 'Login successful',
            userId: req.userId
        });
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
        if (!authProvider.supportsRegistration()) {
            return res.status(STATUS_BAD_REQUEST).json({message: 'Registration is managed externally.'});
        }
        next();
    },
    authProvider.register
]);

module.exports = router;
