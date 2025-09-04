const express = require('express');
const validator = require('validator');
const authProvider = require('../auth/authProvider'); // Interface-based provider

const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONFLICT = 409;

// Password strength validation function
// Enforces: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
function isStrongPassword(password) {
    return typeof password === 'string' &&
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password);
}

const router = express.Router();

/**
 * @swagger
 * /tenant/login:
 *   post:
 *     summary: Authenticate tenant and return JWT token
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
 *             required:
 *               - email
 *               - password
 *     responses:
 *       200:
 *         description: JWT token returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: Bad request, missing or invalid fields
 *       401:
 *         description: Unauthorized, invalid credentials
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(STATUS_BAD_REQUEST).json({ message: 'Email and password are required' });
    }
    try {
        const token = await authProvider.login(email, password);
        if (!token) {
            return res.status(STATUS_UNAUTHORIZED).json({ message: 'Invalid credentials' });
        }
        return res.status(STATUS_OK).json({ token });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(STATUS_BAD_REQUEST).json({ message: 'An error occurred during login' });
    }
});

/**
 * @swagger
 * /tenant/register:
 *   post:
 *     summary: Register a new tenant
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
router.post('/register', async (req, res) => {
    if (!authProvider.supportsRegistration()) {
        return res.status(STATUS_BAD_REQUEST).json({ message: 'Registration is managed externally.' });
    }
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        return res.status(STATUS_BAD_REQUEST).json({ message: 'All three fields required' });
    }
    if (!validator.isEmail(email)) {
        return res.status(STATUS_BAD_REQUEST).json({ message: 'Invalid email format' });
    }
    if (!isStrongPassword(password)) {
        return res.status(STATUS_BAD_REQUEST).json({ message: 'Password must be at least 8 characters, and include uppercase, lowercase, number, and special character' });
    }
    try {
        const result = await authProvider.register(email, password, name);
        if (result.error) {
            return res.status(result.status || STATUS_BAD_REQUEST).json({ message: result.error });
        }
        return res.status(STATUS_CREATED).json({ message: 'Tenant registered successfully' });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(STATUS_BAD_REQUEST).json({ message: 'An error occurred during registration' });
    }
});

module.exports = router;
