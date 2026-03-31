const mongoose = require("mongoose");
const { dbConnection } = require("./env");

let connected = false;

async function mongo() {
  if (connected && mongoose.connection.readyState === 1) {
    return mongoose.connection.db;
  }
  if (!dbConnection) {
    throw new Error("MongoDB connection string is not defined in environment variables.");
  }
  await mongoose.connect(dbConnection, { dbName: "SEEDS-Teacher-Backend" });
  connected = true;
  return mongoose.connection.db;
}

module.exports = mongo;
