"use strict";

// Test-only env bootstrap so CI can run unit/integration suites without .env files.
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = process.env.TEST_JWT_EXPIRES_IN || "24h";
}

if (!process.env.PASSWORD_SALT_ROUNDS) {
  process.env.PASSWORD_SALT_ROUNDS = process.env.TEST_PASSWORD_SALT_ROUNDS || "10";
}
