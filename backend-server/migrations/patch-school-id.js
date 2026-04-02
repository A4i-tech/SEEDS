"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

async function run() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/SEEDS-Teacher-Backend";
    await mongoose.connect(uri);
    const db = mongoose.connection;

    const schoolId = "69a92b526d7b0a801b42675c";
    const tenantId = "69660fae7fccd4ee129e58ae";

    // Patch ivrv2logs: set school_id on all docs that belong to this tenant
    const ivr = await db.collection("ivrv2logs").updateMany(
        { tenant_id: tenantId, school_id: null },
        { $set: { school_id: schoolId } }
    );
    console.log("ivrv2logs  — matched:", ivr.matchedCount, "| modified:", ivr.modifiedCount);

    // Patch contentsV3: set schoolId on all docs that belong to this tenant
    const content = await db.collection("contentsV3").updateMany(
        { tenantId, schoolId: { $exists: false } },
        { $set: { schoolId } }
    );
    console.log("contentsV3 — matched:", content.matchedCount, "| modified:", content.modifiedCount);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
