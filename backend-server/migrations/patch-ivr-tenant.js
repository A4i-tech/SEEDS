"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

async function run() {
    const uri = process.env.DB_CONNECTION || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/SEEDS-Teacher-Backend";
    await mongoose.connect(uri);
    const db = mongoose.connection;

    const result = await db.collection("ivrv2logs").updateMany(
        { tenant_id: "690dbc1b3b41c70deffa2761" },
        { $set: { tenant_id: "69660fae7fccd4ee129e58ae" } }
    );

    console.log("Matched:", result.matchedCount);
    console.log("Modified:", result.modifiedCount);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
