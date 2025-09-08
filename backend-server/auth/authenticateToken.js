const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const SECRET_KEY = process.env.SECRET_KEY;
const AUTH_TYPE = process.env.AUTH_TYPE || 'native';
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;

// Ensure SECRET_KEY is defined for native auth
if (AUTH_TYPE === 'native' && (!SECRET_KEY || typeof SECRET_KEY !== 'string' || SECRET_KEY.trim() === '')) {
    throw new Error('SECRET_KEY environment variable must be defined and non-empty for native authentication');
}

// Ensure Firebase is initialized for Firebase auth
if (AUTH_TYPE === 'firebase' && !admin.apps.length) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require('./serviceAccountKey.json');
    }
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(STATUS_UNAUTHORIZED);

    if (AUTH_TYPE === 'native') {
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.sendStatus(STATUS_FORBIDDEN);
            req.user = user;
            next();
        });
    } else if (AUTH_TYPE === 'firebase') {
        admin.auth().verifyIdToken(token)
            .then((decodedToken) => {
                req.user = decodedToken;
                next();
            })
            .catch(() => res.sendStatus(STATUS_FORBIDDEN));
    } else {
        res.sendStatus(STATUS_UNAUTHORIZED);
    }
}

module.exports = authenticateToken;
