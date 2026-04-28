// Shared test environment — runs before every test file.
// Sets process.env BEFORE any app module reads config/env.js,
// so the Express app and test-signed JWTs use the same secret.
process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";
process.env.AZURE_STORAGE_ACCOUNT_NAME = "mockaccountname";
process.env.AZURE_STORAGE_ACCOUNT_KEY =
  "mockkeymockkeymockkeymockkeymockkeymockkeymockkeymockkey";
process.env.JWT_EXPIRES_IN = process.env.TEST_JWT_EXPIRES_IN || "24h";
process.env.PASSWORD_SALT_ROUNDS = process.env.TEST_PASSWORD_SALT_ROUNDS || "10";
