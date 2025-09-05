const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;

// Ensure SECRET_KEY is defined
if (!SECRET_KEY || typeof SECRET_KEY !== 'string' || SECRET_KEY.trim() === '') {
    throw new Error('SECRET_KEY environment variable must be defined and non-empty');
}
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(STATUS_UNAUTHORIZED);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(STATUS_FORBIDDEN);
        req.user = user;
        next();
    });
}

module.exports = authenticateToken;
