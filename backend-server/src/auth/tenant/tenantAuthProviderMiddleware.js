const {authType, secretKey, jwtExpiresIn, passwordSaltRounds} = require('../../config/env');
const {STATUS, PASSWORD_POLICY} = require('../../config/constants');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const nativeDb = require('../dbAdapters/nativeDb');
const firebaseDb = require('../dbAdapters/firebaseDb');

const dbAdapter = authType === 'firebase' ? firebaseDb : nativeDb;

function generateToken(payload){
  return jwt.sign(
    payload,
    secretKey,
    {expiresIn: jwtExpiresIn, issuer: 'tenant'}
  );
}

module.exports = {
  getLoginType: () => authType,
  supportsRegistration: () => true,
  async login(req, res) {
    const {email, password} = req.body;
    if (!email || !password) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Email and password are required'});
    }
    try {
      const tenant = await dbAdapter.getTenantByEmail(email);
      if (!tenant) {
        return res.status(STATUS.UNAUTHORIZED).json({message: 'Invalid credentials'});
      }
      const passwordMatch = await bcrypt.compare(password, tenant.password);
      if (!passwordMatch) {
        return res.status(STATUS.UNAUTHORIZED).json({message: 'Invalid credentials'});
      }
      const token = generateToken(
        {id: tenant._id || tenant.id, email: tenant.email, name: tenant.tenantName}
      );
      return res.status(STATUS.OK).json({token});
    } catch (error) {
      console.error('Login error:', error);
      return res.status(STATUS.INTERNAL_ERROR).json({message: 'Internal server error'});
    }
  },
  async register(req, res) {
    const {email, password, tenantName} = req.body;
    if (!email || !password || !tenantName) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'All three fields required'});
    }
    if (!validator.isEmail(email)) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Invalid email format'});
    }
    if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Password must be at least 8 characters, and include uppercase, lowercase, number, and special character'});
    }
    try {
      const existingTenant = await dbAdapter.getTenantByEmail(email);
      if (existingTenant) {
        return res.status(STATUS.CONFLICT).json({message: 'Email already exists'});
      }
      const passwordHash = await bcrypt.hash(password, parseInt(passwordSaltRounds));
      await dbAdapter.insertTenant({ email, passwordHash, tenantName });
      return res.status(STATUS.CREATED).json({message: 'Tenant registered successfully'});
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(STATUS.INTERNAL_ERROR).json({message: 'Internal server error'});
    }
  }
};
