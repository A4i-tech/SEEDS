const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
const envPath = path.resolve(process.cwd(), envFile);

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`Loaded environment variables from ${envFile}`);
} else {
  console.log("Using system environment variables");
}
const config = {
  port: process.env.PORT,
  dbConnection: process.env.DB_CONNECTION,
  secretKey: process.env.SECRET_KEY,
  ivrServerUrl: process.env.IVR_SERVER_URL,
  confServerUrl: process.env.CONF_SERVER_URL,
  authType: process.env.AUTH_TYPE,
  firebaseApiKey: process.env.FIREBASE_API_KEY,
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  passwordSaltRounds: process.env.PASSWORD_SALT_ROUNDS || "10",
};
if (config.authType === "firebase") {
  if (!config.firebaseApiKey || !config.firebaseServiceAccount) {
    throw new Error(
      "Firebase auth selected but FIREBASE_API_KEY or FIREBASE_SERVICE_ACCOUNT is missing in environment variables"
    );
  }
}
module.exports = config;
