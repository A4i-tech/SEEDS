"use strict";

const mongoose = require("mongoose");
const mongo = require("../src/config/mongo");
const Tenant = require("../src/models/Tenant");
const { ContentV3 } = require("../src/models/ContentV3");

function parseArgs(argv) {
  const args = {
    apply: false,
    tenantId: null,
    limit: null,
  };

  argv.forEach((arg) => {
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg.startsWith("--tenantId=")) {
      args.tenantId = arg.split("=")[1] || null;
    } else if (arg.startsWith("--limit=")) {
      const raw = arg.split("=")[1];
      const parsed = Number.parseInt(raw, 10);
      args.limit = Number.isNaN(parsed) ? null : parsed;
    }
  });

  return args;
}

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

async function run() {
  const { apply, tenantId: overrideTenantId, limit } = parseArgs(process.argv.slice(2));

  await mongo();

  const missingTenantQuery = {
    $or: [
      { tenantId: { $exists: false } },
      { tenantId: null },
      { tenantId: "" },
    ],
  };

  const cursor = ContentV3.find(missingTenantQuery).select("_id createdBy tenantId").lean();
  if (typeof limit === "number" && limit > 0) {
    cursor.limit(limit);
  }
  const docs = await cursor.exec();

  const tenants = await Tenant.find({}).select("_id tenantName").lean().exec();
  const tenantByName = new Map(
    tenants
      .filter((t) => t.tenantName)
      .map((t) => [normalizeName(t.tenantName), String(t._id)]),
  );

  let matchedByOverride = 0;
  let matchedByCreatedBy = 0;
  let skipped = 0;
  let updated = 0;

  for (const doc of docs) {
    let targetTenantId = null;

    if (overrideTenantId) {
      targetTenantId = overrideTenantId;
      matchedByOverride += 1;
    } else {
      const key = normalizeName(doc.createdBy);
      if (key && tenantByName.has(key)) {
        targetTenantId = tenantByName.get(key);
        matchedByCreatedBy += 1;
      }
    }

    if (!targetTenantId) {
      skipped += 1;
      continue;
    }

    if (apply) {
      await ContentV3.updateOne({ _id: doc._id }, { $set: { tenantId: targetTenantId } }).exec();
      updated += 1;
    }
  }

  console.log("--- backfillContentTenantId summary ---");
  console.log(`mode: ${apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`documents_missing_tenantId: ${docs.length}`);
  console.log(`matched_by_override: ${matchedByOverride}`);
  console.log(`matched_by_createdBy_tenantName: ${matchedByCreatedBy}`);
  console.log(`skipped_unresolved: ${skipped}`);
  console.log(`updated: ${apply ? updated : 0}`);

  if (!apply) {
    console.log("No data was changed. Re-run with --apply to persist updates.");
  }
}

run()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
