const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

/**
 * Set shared environment variables needed by the app during integration tests.
 */
function configureTestEnv() {
  process.env.AUTH_TYPE = "native";
  process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";
  process.env.AZURE_STORAGE_ACCOUNT_NAME = "mockaccountname";
  process.env.AZURE_STORAGE_ACCOUNT_KEY = "mockkeymockkeymockkeymockkeymockkeymockkeymockkeymockkey";
}

/**
 * Start an in-memory MongoDB instance and connect mongoose.
 * Call this inside beforeAll().
 */
async function setup() {
  configureTestEnv();
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

/**
 * Drop the database, close the connection, and stop the server.
 * Call this inside afterAll().
 */
async function teardown() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
}

/**
 * Delete all documents from every collection.
 * Call this inside beforeEach() to ensure test isolation.
 */
async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}

module.exports = { setup, teardown, clearDatabase };
