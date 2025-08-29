const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Tenant = require('../models/Tenant');

const SECRET_KEY = process.env.SECRET_KEY;
const JWT_EXPIRES_IN = '24h';
const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONFLICT = 409;
const PASSWORD_SALT_ROUNDS = 10;

const router = express.Router();

router.post('/login', async (req, res) => {
    const {email, password} = req.body;
    const tenant = await Tenant.findOne({email});
    console.log('Login attempt:', {email});
    if (!tenant) {
        console.log('Tenant not found');
        return res.status(STATUS_UNAUTHORIZED).json({message: 'Invalid credentials'});
    }
    const passwordMatch = bcrypt.compareSync(password, tenant.password);
    console.log('Password match:', passwordMatch);
    if (!passwordMatch) {
        return res.status(STATUS_UNAUTHORIZED).json({message: 'Invalid credentials'});
    }
    const token = jwt.sign({
        id: tenant._id,
        email: tenant.email,
        name: tenant.name
    }, SECRET_KEY, {expiresIn: JWT_EXPIRES_IN});
    res.status(STATUS_OK).json({token});
});

router.post('/register', async (req, res) => {
    const {email, password, name} = req.body;
    if (!email || !password || !name) {
        return res.status(STATUS_BAD_REQUEST).json({message: 'All three fields required'});
    }
    const existingTenant = await Tenant.findOne({email});
    if (existingTenant) {
        return res.status(STATUS_CONFLICT).json({message: 'Email already exists'});
    }
    const hashedPassword = bcrypt.hashSync(password, PASSWORD_SALT_ROUNDS);
    const tenant = new Tenant({email, password: hashedPassword, name});
    await tenant.save();
    res.status(STATUS_CREATED).json({message: 'Tenant registered successfully'});
});

module.exports = router;
