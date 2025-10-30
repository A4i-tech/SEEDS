const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Tenant = require('../models/Tenant');
const validator = require("validator");
const {secretKey, jwtExpiresIn, passwordSaltRounds} = require('../config/env');
const {STATUS} = require('../config/constants');
// Ensure secretKey is defined
if (!secretKey || typeof secretKey !== 'string' || secretKey.trim() === '') {
    throw new Error('secretKey environment variable must be defined and non-empty');
}


module.exports = {
    // Native login function as Express middleware
    async login(req, res) {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(STATUS.BAD_REQUEST).json({message: 'Email and password are required'});
        }
        try {
            const tenant = await Tenant.findOne({ email });
            if (!tenant) {
                return res.status(STATUS.UNAUTHORIZED).json({ message: 'Invalid credentials' });
            }
            const passwordMatch = await bcrypt.compare(password, tenant.password);
            if (!passwordMatch) {
                return res.status(STATUS.UNAUTHORIZED).json({ message: 'Invalid credentials' });
            }
            const token = jwt.sign(
                { id: tenant._id, email: tenant.email, name: tenant.name },
                secretKey,
                { expiresIn: jwtExpiresIn }
            );
            return res.status(STATUS.OK).json({ token });
        } catch (err) {
            console.error('Login error:', err);
            return res.status(STATUS.INTERNAL_ERROR).json({ message: 'Internal server error' });
        }
    },
    supportsRegistration() {
        return true;
    },
    // Native register function as Express middleware
    async register(req, res) {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(STATUS.BAD_REQUEST).json({ message: 'All three fields required' });
        }
        if (!validator.isEmail(email)) {
            return res.status(STATUS.BAD_REQUEST).json({message: 'Invalid email format'});
        }
        if (!validator.isStrongPassword(password, {
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 1})
        ) {
            return res.status(STATUS.BAD_REQUEST).json({message: 'Password must be at least 8 characters, and include uppercase, lowercase, number, and special character'});
        }
        try {
            const existingTenant = await Tenant.findOne({ email });
            if (existingTenant) {
                return res.status(STATUS.CONFLICT).json({ message: 'Email already exists' });
            }
            const hashedPassword = await bcrypt.hash(password, passwordSaltRounds);
            const tenant = new Tenant({ email, password: hashedPassword, name });
            await tenant.save();
            return res.status(STATUS.CREATED).json({ message: 'Tenant registered successfully' });
        } catch (err) {
            console.error('Register error:', err);
            return res.status(STATUS.INTERNAL_ERROR).json({ message: 'Internal server error' });
        }
    }
};
