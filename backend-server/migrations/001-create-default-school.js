"use strict";

/**
 * Phase 1: Create a default School for each Tenant.
 *
 * Current DB state (as of migration):
 *   - 1 tenant:  69660fae7fccd4ee129e58ae (test@gmail.com / temp-tenant)
 *   - No schools collection yet
 *
 * Result: one School document per tenant, returned as { tenantId -> schoolId } map.
 */

const mongoose = require("mongoose");
const Tenant = require("../src/models/Tenant");
const School = require("../src/models/School");

async function createDefaultSchools() {
    console.log("Phase 1: Creating default schools for each tenant...");

    const tenants = await Tenant.find({}).lean();
    if (tenants.length === 0) {
        throw new Error("No tenants found. Cannot create schools.");
    }

    const schoolMap = {};

    for (const tenant of tenants) {
        const tenantId = new mongoose.Types.ObjectId(tenant._id);

        // Idempotent: skip if a school already exists for this tenant
        const existing = await School.findOne({ tenantId });
        if (existing) {
            console.log(`  Tenant ${tenantId}: school already exists (${existing._id}), skipping.`);
            schoolMap[tenantId] = existing._id.toString();
            continue;
        }

        const school = await School.create({
            tenantId,
            name: `${tenant.tenantName} — Default School`,
            email: `school@${tenant.tenantName.toLowerCase().replace(/\s+/g, "-")}.local`,
        });

        console.log(`  Tenant ${tenantId}: created school ${school._id} ("${school.name}")`);
        schoolMap[tenantId] = school._id.toString();
    }

    console.log("Phase 1 complete.");
    return schoolMap;
}

module.exports = { createDefaultSchools };
