const jwt = require('jsonwebtoken');
const authProvider = require('./authProvider');
const AUTH_TYPE = process.env.AUTH_TYPE || 'native';
const SECRET_KEY = process.env.SECRET_KEY;

async function authProviderMiddleware(req, res, next) {
    let token;
    let email;
    if (AUTH_TYPE === 'native') {
        // Native JWT: get token from Authorization header
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.sendStatus(401);
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else if (AUTH_TYPE === 'firebase') {
        // Firebase: get token from Authorization or authtoken header, email from body or header
        token = req.headers['authtoken'] || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
        email = req.body.email || req.headers['email'];
        if (!token) return res.sendStatus(401);
        // Use authProvider.login to verify
        try {
            const jwtToken = await authProvider.login(email || '', token);
            if (!jwtToken) return res.sendStatus(403);
            req.user = jwt.decode(jwtToken);
            next();
        } catch (err) {
            return res.sendStatus(403);
        }
    } else {
        return res.sendStatus(401);
    }
}

module.exports = authProviderMiddleware;
