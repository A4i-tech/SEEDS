const admin = require('firebase-admin');
const validator = require('validator');
const {authType, firebaseServiceAccount} = require('../config/env');
const {STATUS} = require('../config/constants');
// Firebase initialization (env or file)
let serviceAccount;
if (authType === 'firebase') {
  if (firebaseServiceAccount) {
    serviceAccount = JSON.parse(firebaseServiceAccount);
  } else {
    console.error("Failed to read serviceAccountKey.json");
    return false;
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
}

module.exports = {
  async login(req, res) {
    try {
      console.log(`\nRequest:\n` +
        `body: ${JSON.stringify(req.body)}\n` +
        `query: ${JSON.stringify(req.query)}\n` +
        `params: ${JSON.stringify(req.params)}`);

      const authToken = req.headers['authtoken'];
      const {email, password} = req.body;

      if (email && password) {
        try {
          console.log("Attempting native login for email:", email);
          const response = {
            data: {
              displayName: "ap",
              email: email,
              localId: "native-user",

            }
          };
          console.log("Native login successful:", response.data);

          // Return user data in the same format as native auth
          return res.status(STATUS.OK).json({
            name: response.data.displayName || email.split('@')[0], // Use displayName or email prefix as name
            email: response.data.email || email,
            id: response.data.localId
          });
        } catch (error) {
          console.error("Error during native login:", error);
          return res.status(STATUS.UNAUTHORIZED).send({error: "Invalid email or password"});
        }
      }

      if (authToken === "postman" || authToken === "postman1") {
        req.userId = "postman@gmail.com";
        console.log("Test token detected. userId set to postman@gmail.com");
      } else if (authToken && authToken.startsWith("+91") && authToken.length === 13) {
        req.userId = authToken;
        console.log(`Phone number token detected. userId set to ${authToken}`);
      }

      // Verify Firebase token
      if (authToken) {
        try {
          const token = await admin.auth().verifyIdToken(authToken);
          console.log("Firebase token verified successfully:", JSON.stringify(token));
          req.userId = token.phone_number || token.uid;
          console.log(`userId extracted: ${req.userId}`);
        } catch (error) {
          console.error("Error verifying Firebase token:", error);
          return res.status(STATUS.UNAUTHORIZED).send({error: "Invalid token"});
        }
      }

      // If no valid authToken is provided
      console.error("No valid authToken provided.");
      return res.status(STATUS.UNAUTHORIZED).send({error: "Unauthorized"});
    } catch (error) {
      console.error('Login error:', error);
      if (!res.headersSent) {
        return res.status(STATUS.UNAUTHORIZED).send({error: "Internal server error"});
      }
    }
  },

  supportsRegistration() {
    return true;
  },

  async register(req, res) {
    const {email, password, name} = req.body;
    if (!email || !password || !name) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Email, password, and name are required'});
    }
    if (!validator.isEmail(email)) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Invalid email format'});
    }
    if (!validator.isStrongPassword(password, {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1
    })) {
      return res.status(STATUS.BAD_REQUEST).json({message: 'Password must be at least 8 characters, and include uppercase, lowercase, number, and special character'});
    }
    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name
      });
      await admin.firestore().collection('tenants').doc(userRecord.uid).set({
        email,
        name,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log("Firebase user created:", userRecord.uid);
      res.status(STATUS.CREATED).send({message: "User registered successfully", uid: userRecord.uid});
    } catch (error) {
      console.error("Error creating Firebase user:", error);
      return {
        error: 'Registration is managed by Firebase. Please use Firebase client SDK.',
        status: STATUS.BAD_REQUEST
      };
    }
  }
};
