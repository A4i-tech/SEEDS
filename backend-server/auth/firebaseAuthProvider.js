const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const path = require('path');
const SECRET_KEY = process.env.SECRET_KEY;
const JWT_EXPIRES_IN = '24h';

// Firebase initialization (env or file)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    serviceAccount = path.join(__dirname, 'serviceAccountKey.json');
}
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

module.exports = {
    async login(email, idToken) {
        // Custom logic for postman and phone number tokens
        if (idToken === 'postman' || idToken === 'postman1') {
            return jwt.sign(
                { id: 'postman', email: 'postman@gmail.com', name: 'Postman User' },
                SECRET_KEY,
                { expiresIn: JWT_EXPIRES_IN }
            );
        }
        if (idToken && idToken.startsWith('+91') && idToken.length === 13) {
            return jwt.sign(
                { id: idToken, email: '', name: 'Phone User' },
                SECRET_KEY,
                { expiresIn: JWT_EXPIRES_IN }
            );
        }
        // Firebase token verification
        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            if (decodedToken.email !== email) return null;
            return jwt.sign(
                { id: decodedToken.uid, email: decodedToken.email, name: decodedToken.name || '' },
                SECRET_KEY,
                { expiresIn: JWT_EXPIRES_IN }
            );
        } catch (err) {
            return null;
        }
    },
    supportsRegistration() {
        return false;
    },
    async register(email, password, name) {
        return { error: 'Registration is managed by Firebase. Please use Firebase client SDK.' };
    }
};
