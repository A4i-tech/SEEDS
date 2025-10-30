const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const validator = require('validator');
const {firebaseServiceAccount} = require('../config/env');
const {STATUS, PASSWORD_POLICY} = require('../config/constants');
const {secretKey, jwtExpiresIn, passwordSaltRounds} = require('../config/env');
// Firebase initialization (env or file)
let serviceAccount = JSON.parse(firebaseServiceAccount);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
module.exports = {
  async login(req, res) {
    const {email, password} = req.body;
    if (!email || !password) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Email and password are required'});
    }
    try {
      const tenant = await db.collection('tenants').where('email', '==', email).get();
      if (tenant.empty) {
        return res.status(STATUS.UNAUTHORIZED).json({message: 'Invalid credentials'});
      }
      const tenantData = tenant.docs[0].data();
      const passwordMatch = await bcrypt.compare(password, tenantData.passwordHash);
      if (!passwordMatch) {
        return res.status(STATUS.UNAUTHORIZED).json({message: 'Invalid credentials'});
      }
      const token = jwt.sign(
        {id: tenant.docs[0].id, email: tenantData.email, name: tenantData.tenantName},
        secretKey,
        {expiresIn: jwtExpiresIn, issuer: 'tenant', algorithm: 'RS256'}
      );
      return res.status(STATUS.OK).json({token});
    } catch (error) {
      console.error('Login error:', error);
      return res.status(STATUS.INTERNAL_ERROR).json({message: 'Internal server error'});
    }
  },

  supportsRegistration() {
    return true;
  },

  async register(req, res) {
    const {email, password, tenantName} = req.body;
    if (!email || !password || !tenantName) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Email, password, and tenantName are required'});
    }
    if (!validator.isEmail(email)) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Invalid email format'});
    }
    if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Password must be at least 8 characters, and include uppercase, lowercase, number, and special character'});
    }
    try {
      const existingTenant = await db.collection('tenants').where('email', '==', email).get();
      if (!existingTenant.empty) {
        return res.status(STATUS.CONFLICT).json({message: 'Email already exists'});
      }
      const hashedPassword = await bcrypt.hash(password, passwordSaltRounds);
      await db.collection('tenants').add({
        email,
        passwordHash: hashedPassword,
        tenantName
      });
      return res.status(STATUS.CREATED).json({message: 'Tenant registered successfully'});
    } catch (error) {
      console.error("Error creating Firebase user:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({message: 'Internal server error'});
    }
  }
};
