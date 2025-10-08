const express = require('express');
const authProvider = require('../auth/authProviderMiddleware');

const STATUS_BAD_REQUEST = 400;
const STATUS_OK = 200;

const router = express.Router();

/**
 * @swagger
 *  /tenant/login:
 *     post:
 *       summary: Authenticate tenant and return JWT token (native) or verify Firebase token
 *       tags:
 *         - Tenant
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       description: Tenant's email address (native login)
 *                     password:
 *                       type: string
 *                       description: Tenant's password (native login)
 *                   required:
 *                     - email
 *                     - password
 *                 - type: object
 *                   properties:
 *                     authtoken:
 *                       type: string
 *                       description: Firebase ID token or test token (firebase login)
 *                   required:
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
