"use strict";

/**
 * Phase 6: Convert class.students and class.leaders from phone number strings
 * to Student ObjectId references.
 *
 * Background:
 *   The Class schema previously stored students/leaders as [String] (phone numbers).
 *   It now uses [ObjectId] referencing the Student collection.
 *
 * Strategy:
 *   1. Find all classes where students or leaders contain non-ObjectId strings.
 *   2. For each phone number, look up the Student by phoneNumber + schoolId.
 *   3. Replace the phone number with the Student's ObjectId.
 *   4. Classes already using ObjectIds (or empty arrays) are skipped — idempotent.
 */

const mongoose = require("mongoose");

async function migrateClassStudentRefs() {
    console.log("Phase 6: Converting class students/leaders from phone numbers to ObjectId refs...");

    const db = mongoose.connection;
    const classes = await db.collection("classes").find({}).toArray();

    console.log(`  Found ${classes.length} class(es) to check.`);

    let updatedClasses = 0;
    let resolvedRefs = 0;
    let unresolvable = 0;

    const resolvePhonesToIds = async (values, schoolId, classId) => {
        const ids = [];
        for (const val of values) {
            if (mongoose.Types.ObjectId.isValid(val) && String(val).length === 24) {
                // Already an ObjectId — keep as-is
                ids.push(new mongoose.Types.ObjectId(val));
                continue;
            }

            // val is a phone number string — look up Student by schoolId + phoneNumber
            let student = await db.collection("students").findOne({
                phoneNumber: String(val),
                schoolId,
            });

            if (!student) {
                // Fallback: search without schoolId constraint (legacy/orphaned data)
                student = await db.collection("students").findOne({ phoneNumber: String(val) });
            }

            if (student) {
                ids.push(student._id);
                resolvedRefs++;
            } else {
                console.warn(`    WARNING: No Student found for phone "${val}" (class ${String(classId)}). Skipping.`);
                unresolvable++;
                // Drop unresolvable entries — they reference non-existent students
            }
        }
        return ids;
    };

    for (const cls of classes) {
        const hasStringStudents = (arr) =>
            Array.isArray(arr) &&
            arr.some((v) => !(mongoose.Types.ObjectId.isValid(v) && String(v).length === 24));

        if (!hasStringStudents(cls.students) && !hasStringStudents(cls.leaders)) {
            continue; // already migrated or empty
        }

        const newStudents = await resolvePhonesToIds(cls.students || [], cls.schoolId, cls._id);
        const newLeaders  = await resolvePhonesToIds(cls.leaders  || [], cls.schoolId, cls._id);

        await db.collection("classes").updateOne(
            { _id: cls._id },
            { $set: { students: newStudents, leaders: newLeaders } }
        );
        updatedClasses++;
    }

    console.log(`  Updated ${updatedClasses} class(es).`);
    console.log(`  Resolved ${resolvedRefs} student/leader reference(s) to ObjectIds.`);
    if (unresolvable > 0) {
        console.warn(`  WARNING: ${unresolvable} phone number(s) had no matching Student document and were dropped.`);
    }
    console.log("Phase 6 complete.");
}

module.exports = { migrateClassStudentRefs };
