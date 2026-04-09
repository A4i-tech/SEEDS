"use strict";

/**
 * Phase 3: Add schoolId to all students.
 *
 * Current DB state:
 *   - 4 students, no schoolId, no tenantId
 *   - Students are not directly linked to a tenant — the link is:
 *       teacher.studentId[] contains student ObjectIds
 *       teacher now has schoolId (set in phase 2)
 *
 * Strategy:
 *   1. For each teacher, assign their listed students to the teacher's school.
 *   2. Any remaining students with no schoolId are orphaned — assign them to the
 *      first available school (all data is single-tenant dev/test data).
 */

const mongoose = require("mongoose");
const School = require("../src/models/School");

async function migrateStudents() {
    console.log("Phase 3: Migrating students...");

    const teachers = await mongoose.connection.collection("teachers").find({
        schoolId: { $exists: true },
        studentId: { $exists: true, $not: { $size: 0 } },
    }).toArray();

    let linked = 0;

    for (const teacher of teachers) {
        if (!teacher.studentId || teacher.studentId.length === 0) continue;

        const studentObjectIds = teacher.studentId.map(id => {
            try { return new mongoose.Types.ObjectId(id); }
            catch { return null; }
        }).filter(Boolean);

        if (studentObjectIds.length === 0) continue;

        const result = await mongoose.connection.collection("students").updateMany(
            { _id: { $in: studentObjectIds }, schoolId: { $exists: false } },
            { $set: { schoolId: new mongoose.Types.ObjectId(teacher.schoolId) } }
        );
        linked += result.modifiedCount;
        console.log(`  Teacher ${teacher._id}: linked ${result.modifiedCount} student(s) to school ${teacher.schoolId}.`);
    }

    console.log(`  Linked ${linked} student(s) via teacher.studentId.`);

    // Assign any orphaned students to the first school
    const orphaned = await mongoose.connection.collection("students").countDocuments({
        schoolId: { $exists: false },
    });

    if (orphaned > 0) {
        const firstSchool = await School.findOne({}).lean();
        if (!firstSchool) throw new Error("No school found to assign orphaned students.");

        const result = await mongoose.connection.collection("students").updateMany(
            { schoolId: { $exists: false } },
            { $set: { schoolId: firstSchool._id } }
        );
        console.log(`  Assigned ${result.modifiedCount} orphaned student(s) to school ${firstSchool._id}.`);
    }

    console.log("Phase 3 complete.");
}

module.exports = { migrateStudents };
