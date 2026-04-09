"use strict";

/**
 * Phase 4: Add schoolId to all classes.
 *
 * Current DB state:
 *   - 198 classes, no schoolId
 *   - class.teacher is a mix of phone numbers, email addresses, and a handful of
 *     ObjectId strings — NOT reliably linkable to current teacher documents
 *   - Only 1 class has a teacher value matching a real teacher ObjectId
 *
 * Strategy:
 *   1. For classes whose teacher value is a valid ObjectId AND matches an existing
 *      teacher document, assign that teacher's schoolId.
 *   2. All remaining classes (phone/email teacher values, or unresolvable) are
 *      bulk-assigned to the first available school — they are legacy data from before
 *      the current teacher model existed.
 */

const mongoose = require("mongoose");
const School = require("../src/models/School");

async function migrateClasses() {
    console.log("Phase 4: Migrating classes...");

    const classes = await mongoose.connection.collection("classes").find({
        schoolId: { $exists: false },
    }).toArray();

    console.log(`  Found ${classes.length} class(es) without schoolId.`);

    // Idempotent: if no classes need migration, skip
    if (classes.length === 0) {
        console.log("  No classes to migrate — all already have schoolId.");
        console.log("Phase 4 complete.");
        return;
    }

    const firstSchool = await School.findOne({}).lean();
    if (!firstSchool) throw new Error("No school found.");
    const fallbackSchoolId = firstSchool._id.toString();

    let resolvedViaTeacher = 0;
    let resolvedViaFallback = 0;

    for (const cls of classes) {
        let schoolId = null;

        // Try to resolve via teacher ObjectId
        if (cls.teacher && mongoose.Types.ObjectId.isValid(cls.teacher)) {
            const teacher = await mongoose.connection.collection("teachers").findOne({
                _id: new mongoose.Types.ObjectId(cls.teacher),
                schoolId: { $exists: true },
            });
            if (teacher) {
                schoolId = teacher.schoolId;
                resolvedViaTeacher++;
            }
        }

        // Fall back to the default school (legacy phone/email teacher refs)
        if (!schoolId) {
            schoolId = fallbackSchoolId;
            resolvedViaFallback++;
        }

        await mongoose.connection.collection("classes").updateOne(
            { _id: cls._id },
            { $set: { schoolId } }
        );
    }

    console.log(`  Resolved via teacher lookup:  ${resolvedViaTeacher} class(es).`);
    console.log(`  Resolved via fallback school: ${resolvedViaFallback} class(es).`);
    console.log("Phase 4 complete.");
}

module.exports = { migrateClasses };
