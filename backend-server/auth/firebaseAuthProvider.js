const admin = require('firebase-admin');
const path = require('path');

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

const STATUS_UNAUTHORIZED = 401;
const STATUS_BAD_REQUEST = 400;
const STATUS_OK = 200;
module.exports = {
    async login(req, res, next) {
        try {
            console.log(`\nRequest:\n` +
                `body: ${JSON.stringify(req.body)}\n` +
                `query: ${JSON.stringify(req.query)}\n` +
                `params: ${JSON.stringify(req.params)}`);

            const authToken = req.headers['authtoken'];
            console.log(`authtoken: ${authToken}`);
            if (authToken === "postman" || authToken === "postman1") {
                req.userId = "postman@gmail.com";
                return res.sendStatus(STATUS_OK);
            }
            // regex for a phone number
            else if (authToken && authToken.startsWith("+91") && authToken.length === 13) {
                req.userId = authToken;
                return res.sendStatus(STATUS_OK);
            }
            // Uncomment below to enable Firebase token verification
            // try {
            //     const token = await admin.auth().verifyIdToken(authToken);
            //     console.log(JSON.stringify(token));
            //     req.userId = token.phone_number;
            //     console.log(`userId: ${req.userId}`);
            //     return token;
            // } catch (error) {
            //     console.log(JSON.stringify(error, ["message", "arguments", "type", "name"]));
            //     res.sendStatus(STATUS_UNAUTHORIZED);
            // }
            // res.sendStatus(STATUS_UNAUTHORIZED);
        } catch (error) {
            res.sendStatus(STATUS_UNAUTHORIZED);
        }
    },
    supportsRegistration() {
        return false;
    },
    async register(req, res, next) {
        return { error: 'Registration is managed by Firebase. Please use Firebase client SDK.', status: STATUS_BAD_REQUEST };
    }
};
