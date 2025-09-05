const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Tenant = require('../models/Tenant');
const validator = require("validator");
const SECRET_KEY = process.env.SECRET_KEY;
const JWT_EXPIRES_IN = '24h';
const PASSWORD_SALT_ROUNDS = 10;

const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONFLICT = 409;
const STATUS_INTERNAL_ERROR = 500;
const STATUS_CREATED = 201;
const STATUS_OK = 200;

// Ensure SECRET_KEY is defined
if (!SECRET_KEY || typeof SECRET_KEY !== 'string' || SECRET_KEY.trim() === '') {
    throw new Error('SECRET_KEY environment variable must be defined and non-empty');
}

// Simple password strength checker
function isStrongPassword(password) {
    return typeof password === 'string' &&
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password);
}

module.exports = {
    // Native login function as Express middleware
    async login(req, res, next) {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(STATUS_BAD_REQUEST).json({message: 'Email and password are required'});
        }
        try {
            const tenant = await Tenant.findOne({ email });
            if (!tenant) {
                return res.status(STATUS_UNAUTHORIZED).json({ message: 'Invalid credentials' });
            }
            const passwordMatch = await bcrypt.compare(password, tenant.password);
            if (!passwordMatch) {
                return res.status(STATUS_UNAUTHORIZED).json({ message: 'Invalid credentials' });
            }
            const token = jwt.sign(
                { id: tenant._id, email: tenant.email, name: tenant.name },
                SECRET_KEY,
                { expiresIn: JWT_EXPIRES_IN }
            );
            return res.status(STATUS_OK).json({ token });
        } catch (err) {
            console.error('Login error:', err);
            return res.status(STATUS_INTERNAL_ERROR).json({ message: 'Internal server error' });
        }
    },
    supportsRegistration() {
        return true;
    },
    // Native register function as Express middleware
    async register(req, res, next) {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(STATUS_BAD_REQUEST).json({ message: 'All three fields required' });
        }
        if (!validator.isEmail(email)) {
            return res.status(STATUS_BAD_REQUEST).json({message: 'Invalid email format'});
        }
        if (!isStrongPassword(password)) {
            return res.status(STATUS_BAD_REQUEST).json({message: 'Password must be at least 8 characters, and include uppercase, lowercase, number, and special character'});
        }
        try {
            const existingTenant = await Tenant.findOne({ email });
            if (existingTenant) {
                return res.status(STATUS_CONFLICT).json({ message: 'Email already exists' });
            }
            const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
            const tenant = new Tenant({ email, password: hashedPassword, name });
            await tenant.save();
            return res.status(STATUS_CREATED).json({ message: 'Tenant registered successfully' });
        } catch (err) {
            console.error('Register error:', err);
            return res.status(STATUS_INTERNAL_ERROR).json({ message: 'Internal server error' });
        }
    }
};
