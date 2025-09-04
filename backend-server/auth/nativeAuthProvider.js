const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Tenant = require('../models/Tenant');
const SECRET_KEY = process.env.SECRET_KEY;
const JWT_EXPIRES_IN = '24h';
const PASSWORD_SALT_ROUNDS = 10;

if (!SECRET_KEY || typeof SECRET_KEY !== 'string' || SECRET_KEY.trim() === '') {
    throw new Error('SECRET_KEY environment variable must be defined and non-empty');
}

module.exports = {
    async login(email, password) {
        const tenant = await Tenant.findOne({ email });
        if (!tenant) return null;
        const passwordMatch = await bcrypt.compare(password, tenant.password);
        if (!passwordMatch) return null;
        return jwt.sign(
            { id: tenant._id, email: tenant.email, name: tenant.name },
            SECRET_KEY,
            { expiresIn: JWT_EXPIRES_IN }
        );
    },
    supportsRegistration() {
        return true;
    },
    async register(email, password, name) {
        const existingTenant = await Tenant.findOne({ email });
        if (existingTenant) {
            return { error: 'Email already exists', status: 409 };
        }
        const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
        const tenant = new Tenant({ email, password: hashedPassword, name });
        await tenant.save();
        return {};
    }
};
