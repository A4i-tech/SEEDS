"use strict";

/**
 * Phase 2: Add schoolId to all teachers and remove the now-redundant tenantId field.
 *
 * Current DB state:
 *   - 3 teachers, all with tenantId = '69660fae7fccd4ee129e58ae', no schoolId
 *   - Teacher schema no longer has tenantId (removed in architecture update)
 *
 * Logic: match teacher.tenantId → schoolMap[tenantId] to assign the right school.
 * Then unset tenantId from every teacher document.
 */

const Teacher = require("../src/models/Teacher");
const mongoose = require("mongoose");

async function migrateTeachers(schoolMap) {
    console.log("Phase 2: Migrating teachers...");

    // schoolMap: { tenantId -> schoolId }
    for (const [tenantId, schoolId] of Object.entries(schoolMap)) {
        // Use raw collection to bypass model schema (tenantId no longer in schema)
        const result = await mongoose.connection.collection("teachers").updateMany(
            { tenantId, schoolId: { $exists: false } },
            { $set: { schoolId } }
        );
        console.log(`  Tenant ${tenantId}: set schoolId on ${result.modifiedCount} teacher(s).`);
    }

    // Remove tenantId from all teacher documents
    const unsetResult = await mongoose.connection.collection("teachers").updateMany(
        { tenantId: { $exists: true } },
        { $unset: { tenantId: "" } }
    );
    console.log(`  Removed tenantId from ${unsetResult.modifiedCount} teacher(s).`);

    // Set default role on teachers missing the field
    const roleResult = await mongoose.connection.collection("teachers").updateMany(
        { role: { $exists: false } },
        { $set: { role: "teacher" } }
    );
    console.log(`  Set role="teacher" on ${roleResult.modifiedCount} teacher(s) missing the field.`);

    // Verify
    const missing = await mongoose.connection.collection("teachers").countDocuments({
        schoolId: { $exists: false },
    });
    if (missing > 0) {
        console.warn(`  WARNING: ${missing} teacher(s) still have no schoolId.`);
    } else {
        console.log("  All teachers have schoolId.");
    }

    const missingRole = await mongoose.connection.collection("teachers").countDocuments({
        role: { $exists: false },
    });
    if (missingRole > 0) {
        console.warn(`  WARNING: ${missingRole} teacher(s) still have no role.`);
    } else {
        console.log("  All teachers have role.");
    }

    console.log("Phase 2 complete.");
}

module.exports = { migrateTeachers };
