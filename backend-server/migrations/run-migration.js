"use strict";

/**
 * Master migration runner.
 *
 * Usage:
 *   node migrations/run-migration.js
 *
 * Requires MONGODB_URI in environment (or .env file at project root).
 * Safe to re-run — each phase is idempotent.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const { createDefaultSchools } = require("./001-create-default-school");
const { migrateTeachers }      = require("./002-migrate-teachers");
const { migrateStudents }      = require("./003-migrate-students");
const { migrateClasses }       = require("./004-migrate-classes");
const { migrateContent }            = require("./005-migrate-content");
const { migrateClassStudentRefs }   = require("./006-migrate-class-students");

async function verify() {
    const db = mongoose.connection;
    const stats = {
        schools:             await db.collection("schools").countDocuments(),
        teachersWithSchool:  await db.collection("teachers").countDocuments({ schoolId: { $exists: true } }),
        teachersWithTenant:  await db.collection("teachers").countDocuments({ tenantId: { $exists: true } }),
        teachersWithoutRole: await db.collection("teachers").countDocuments({ role: { $exists: false } }),
        studentsWithSchool:  await db.collection("students").countDocuments({ schoolId: { $exists: true } }),
        studentsWithout:     await db.collection("students").countDocuments({ schoolId: { $exists: false } }),
        classesWithSchool:        await db.collection("classes").countDocuments({ schoolId: { $exists: true } }),
        classesWithout:           await db.collection("classes").countDocuments({ schoolId: { $exists: false } }),
        classesWithStringStudents: await db.collection("classes").countDocuments({ students: { $elemMatch: { $type: "string" } } }),
        contentWithTenant:   await db.collection("contentsV3").countDocuments({ tenantId: { $exists: true } }),
        contentWithout:      await db.collection("contentsV3").countDocuments({ tenantId: { $exists: false } }),
    };

    console.log("\n=== Migration Verification ===");
    console.log(`  Schools created:              ${stats.schools}`);
    console.log(`  Teachers with schoolId:       ${stats.teachersWithSchool}`);
    console.log(`  Teachers still with tenantId: ${stats.teachersWithTenant}  (should be 0)`);
    console.log(`  Teachers missing role:        ${stats.teachersWithoutRole}  (should be 0)`);
    console.log(`  Students with schoolId:       ${stats.studentsWithSchool}`);
    console.log(`  Students missing schoolId:    ${stats.studentsWithout}   (should be 0)`);
    console.log(`  Classes with schoolId:        ${stats.classesWithSchool}`);
    console.log(`  Classes missing schoolId:     ${stats.classesWithout}    (should be 0)`);
    console.log(`  Classes with phone students:  ${stats.classesWithStringStudents}  (should be 0)`);
    console.log(`  Content with tenantId:        ${stats.contentWithTenant}`);
    console.log(`  Content missing tenantId:     ${stats.contentWithout}    (should be 0)`);

    const issues = [
        stats.teachersWithTenant   > 0 && `${stats.teachersWithTenant} teacher(s) still have tenantId`,
        stats.teachersWithoutRole  > 0 && `${stats.teachersWithoutRole} teacher(s) missing role field`,
        stats.studentsWithout    > 0 && `${stats.studentsWithout} student(s) missing schoolId`,
        stats.classesWithout          > 0 && `${stats.classesWithout} class(es) missing schoolId`,
        stats.classesWithStringStudents > 0 && `${stats.classesWithStringStudents} class(es) still have phone-number students (phase 6 incomplete)`,
        stats.contentWithout     > 0 && `${stats.contentWithout} content item(s) missing tenantId`,
    ].filter(Boolean);

    if (issues.length > 0) {
        console.warn("\n  WARNINGS:");
        issues.forEach(i => console.warn(`    - ${i}`));
    } else {
        console.log("\n  All checks passed.");
    }
}

async function run() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/SEEDS-Teacher-Backend";
    console.log(`Connecting to ${uri}...`);
    await mongoose.connect(uri);
    console.log("Connected.\n");

    try {
        const schoolMap = await createDefaultSchools();
        await migrateTeachers(schoolMap);
        await migrateStudents();
        await migrateClasses();
        await migrateContent();
        await migrateClassStudentRefs();
        await verify();
        console.log("\nMigration completed successfully.");
    } catch (err) {
        console.error("\nMigration FAILED:", err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

run();
