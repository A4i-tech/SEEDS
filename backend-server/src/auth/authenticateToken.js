const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const {secretKey, authType, firebaseServiceAccount} = require('../config/env');
const {STATUS} = require('../config/constants');


// Ensure secretKey is defined for native auth
if (authType === 'native' && (!secretKey || typeof secretKey !== 'string' || secretKey.trim() === '')) {
    throw new Error('secretKey environment variable must be defined and non-empty for native authentication');
}

// Ensure Firebase is initialized for Firebase auth
if (authType === 'firebase' && !admin.apps.length) {
    let serviceAccount;
    if (firebaseServiceAccount) {
        serviceAccount = JSON.parse(firebaseServiceAccount);
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
    if (!token) return res.sendStatus(STATUS.UNAUTHORIZED);

    if (authType === 'native') {
        jwt.verify(token, secretKey, (err, user) => {
            if (err) return res.sendStatus(STATUS.FORBIDDEN);
            req.user = user;
            req.userId = user.id ;
            next();
        });
    } else if (authType === 'firebase') {
        admin.auth().verifyIdToken(token)
            .then((decodedToken) => {
                req.user = decodedToken;
                next();
            })
            .catch(() => res.sendStatus(STATUS.FORBIDDEN));
    } else {
        res.sendStatus(STATUS.UNAUTHORIZED);
    }
}

module.exports = authenticateToken;
