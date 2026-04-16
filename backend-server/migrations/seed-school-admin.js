"use strict";

/**
 * Seed a password for the default school (school = school admin after merge).
 *
 * Usage:
 *   node migrations/seed-school-admin.js
 *
 * Finds the school with email SCHOOL_EMAIL and sets its password + isActive.
 * Skips if the school already has a password set.
 * Login credentials after seeding: email=SCHOOL_EMAIL, password=PLAIN_PASSWORD
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SCHOOL_EMAIL = "school@temp-tenant.local";
const PLAIN_PASSWORD = "Test@123";
const SALT_ROUNDS = parseInt(process.env.PASSWORD_SALT_ROUNDS) || 10;

async function run() {
    const uri = process.env.DB_CONNECTION || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/SEEDS-Teacher-Backend";
    console.log(`Connecting to ${uri}...`);
    await mongoose.connect(uri);
    console.log("Connected.\n");

    const db = mongoose.connection;
    try {
        const school = await db.collection("schools").findOne({ email: SCHOOL_EMAIL });
        if (!school) {
            console.error(`School with email "${SCHOOL_EMAIL}" not found. Run the migration first.`);
            process.exitCode = 1;
            return;
        }
        console.log(`Found school: ${school.name} (${school._id})`);

        if (school.password) {
            console.log(`School already has a password set. Skipping.`);
            return;
        }

        const hashedPassword = await bcrypt.hash(PLAIN_PASSWORD, SALT_ROUNDS);

        await db.collection("schools").updateOne(
            { _id: school._id },
            { $set: { password: hashedPassword, isActive: true, updatedAt: new Date() } }
        );

        console.log(`School password set:`);
        console.log(`  email:    ${SCHOOL_EMAIL}  ← login email`);
        console.log(`  password: ${PLAIN_PASSWORD} (hashed, salt rounds: ${SALT_ROUNDS})`);
        console.log(`  schoolId: ${school._id}`);
        console.log(`  tenantId: ${school.tenantId}`);
    } finally {
        await mongoose.disconnect();
    }
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
