"use strict";

/**
 * Rollback migration — reverses all phases.
 *
 * Usage:
 *   node migrations/rollback-migration.js
 *
 * WARNING: This deletes all School documents and removes schoolId / tenantId
 * fields added by the migration. It also restores tenantId on teachers using
 * the school's tenantId before deleting schools.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

async function rollback() {
    const uri = process.env.DB_CONNECTION || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/SEEDS-Teacher-Backend";
    console.log(`Connecting to ${uri}...`);
    await mongoose.connect(uri);
    console.log("Connected.\n");

    const db = mongoose.connection;

    try {
        // Step 1: restore tenantId on teachers before schools are deleted
        console.log("Restoring tenantId on teachers from their school...");
        const schools = await db.collection("schools").find({}).toArray();
        for (const school of schools) {
            const result = await db.collection("teachers").updateMany(
                { schoolId: school._id.toString() },
                { $set: { tenantId: school.tenantId }, $unset: { schoolId: "" } }
            );
            console.log(`  School ${school._id}: restored tenantId + removed schoolId from ${result.modifiedCount} teacher(s).`);
        }

        // Step 2: remove schoolId from students
        const studentResult = await db.collection("students").updateMany(
            { schoolId: { $exists: true } },
            { $unset: { schoolId: "" } }
        );
        console.log(`Removed schoolId from ${studentResult.modifiedCount} student(s).`);

        // Step 3a: revert class students/leaders from ObjectIds back to phone numbers (phase 6 rollback)
        console.log("Reverting class students/leaders from ObjectIds to phone numbers...");
        const allClasses = await db.collection("classes").find({}).toArray();
        let revertedClasses = 0;
        for (const cls of allClasses) {
            const hasObjectIds = (arr) =>
                Array.isArray(arr) && arr.length > 0 &&
                (arr[0]._bsontype === "ObjectId" || arr[0] instanceof mongoose.Types.ObjectId);

            if (!hasObjectIds(cls.students) && !hasObjectIds(cls.leaders)) continue;

            const toPhoneNumbers = async (ids) => {
                const phones = [];
                for (const id of ids) {
                    const student = await db.collection("students").findOne({ _id: id });
                    if (student) phones.push(student.phoneNumber);
                }
                return phones;
            };

            const phoneStudents = await toPhoneNumbers(cls.students || []);
            const phoneLeaders  = await toPhoneNumbers(cls.leaders  || []);
            await db.collection("classes").updateOne(
                { _id: cls._id },
                { $set: { students: phoneStudents, leaders: phoneLeaders } }
            );
            revertedClasses++;
        }
        console.log(`Reverted ${revertedClasses} class(es) students/leaders to phone numbers.`);

        // Step 3b: remove schoolId from classes
        const classResult = await db.collection("classes").updateMany(
            { schoolId: { $exists: true } },
            { $unset: { schoolId: "" } }
        );
        console.log(`Removed schoolId from ${classResult.modifiedCount} class(es).`);

        // Step 4: remove tenantId from contentsV3
        const contentResult = await db.collection("contentsV3").updateMany(
            { tenantId: { $exists: true } },
            { $unset: { tenantId: "" } }
        );
        console.log(`Removed tenantId from ${contentResult.modifiedCount} content item(s).`);

        // Step 5: delete all schools
        const deleteResult = await db.collection("schools").deleteMany({});
        console.log(`Deleted ${deleteResult.deletedCount} school(s).`);

        // Verify
        console.log("\n=== Rollback Verification ===");
        console.log(`  Remaining schools:            ${await db.collection("schools").countDocuments()}`);
        console.log(`  Teachers with tenantId:       ${await db.collection("teachers").countDocuments({ tenantId: { $exists: true } })}`);
        console.log(`  Teachers with schoolId:       ${await db.collection("teachers").countDocuments({ schoolId: { $exists: true } })}`);
        console.log(`  Students with schoolId:       ${await db.collection("students").countDocuments({ schoolId: { $exists: true } })}`);
        console.log(`  Classes with schoolId:        ${await db.collection("classes").countDocuments({ schoolId: { $exists: true } })}`);
        console.log(`  Content with tenantId:        ${await db.collection("contentsV3").countDocuments({ tenantId: { $exists: true } })}`);

        console.log("\nRollback completed.");
    } catch (err) {
        console.error("\nRollback FAILED:", err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

rollback();
