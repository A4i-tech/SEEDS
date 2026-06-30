"use strict";

/**
 * Phase 5: Add tenantId to all contentsV3 documents.
 *
 * Current DB state:
 *   - 72 contentsV3 documents, none have tenantId
 *   - 1 tenant exists: 69660fae7fccd4ee129e58ae
 *
 * With a single tenant all content belongs to it.
 * For multi-tenant environments this migration would need manual mapping.
 */

const mongoose = require("mongoose");
const Tenant = require("../src/models/Tenant");

async function migrateContent() {
    console.log("Phase 5: Adding tenantId to contentsV3...");

    const tenants = await Tenant.find({}).lean();

    if (tenants.length === 0) {
        throw new Error("No tenants found.");
    }

    if (tenants.length > 1) {
        console.warn(`  WARNING: ${tenants.length} tenants found. All un-tagged content will be assigned to the first tenant.`);
        console.warn("  Review and re-assign content manually if needed.");
    }

    const tenantId = new mongoose.Types.ObjectId(tenants[0]._id);

    const result = await mongoose.connection.collection("contentsV3").updateMany(
        { tenantId: { $exists: false } },
        { $set: { tenantId } }
    );

    console.log(`  Tagged ${result.modifiedCount} content item(s) with tenantId ${tenantId}.`);
    console.log("Phase 5 complete.");
}

module.exports = { migrateContent };
