const jwt = require('jsonwebtoken');

if (!SECRET_KEY || typeof SECRET_KEY !== 'string' || SECRET_KEY.trim() === '') {
    throw new Error('SECRET_KEY environment variable must be defined and non-empty');
}
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

module.exports = authenticateToken;
