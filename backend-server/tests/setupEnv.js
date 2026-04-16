"use strict";

// Test-only env bootstrap so CI can run unit/integration suites without .env files.
// Sets process.env BEFORE any app module reads config/env.js,
// so the Express app and test-signed JWTs use the same secret.
if (!process.env.AUTH_TYPE) {
  process.env.AUTH_TYPE = "native";
}
if (!process.env.SECRET_KEY) {
  process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";
}
if (!process.env.AZURE_STORAGE_ACCOUNT_NAME) {
  process.env.AZURE_STORAGE_ACCOUNT_NAME = "mockaccountname";
}
if (!process.env.AZURE_STORAGE_ACCOUNT_KEY) {
  process.env.AZURE_STORAGE_ACCOUNT_KEY =
    "mockkeymockkeymockkeymockkeymockkeymockkeymockkeymockkey";
}
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = process.env.TEST_JWT_EXPIRES_IN || "24h";
}
if (!process.env.PASSWORD_SALT_ROUNDS) {
  process.env.PASSWORD_SALT_ROUNDS = process.env.TEST_PASSWORD_SALT_ROUNDS || "10";
}
