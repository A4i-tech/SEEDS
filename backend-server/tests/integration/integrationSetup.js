const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

/**
 * Start an in-memory MongoDB instance and connect mongoose.
 * Environment variables (SECRET_KEY, AUTH_TYPE, etc.) are set by jest.setup.js.
 * Call this inside beforeAll().
 */
async function setup() {
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
