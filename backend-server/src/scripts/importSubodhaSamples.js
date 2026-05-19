"use strict";
/**
 * CLI runner: import sampled Subodha LMS course JSONs into ContentV3.
 *
 * Thin wrapper over importerCore.upsertImported() + subodhaAdapter.mapSubodhaCourseToImported().
 * All Subodha-specific logic lives in src/importers/subodhaAdapter.js.
 *
 * Usage:
 *   node src/scripts/importSubodhaSamples.js \
 *     --tenantId <ObjectId> \
 *     [--source /abs/path/to/subodha_exploration/pipeline/out] \
 *     [--force]                                  # bypass contentHash skip
 *     [--undelete]                               # revive soft-deleted matches
 */

const fs = require("fs");
const path = require("path");

const mongo = require("../config/mongo.js");
const { upsertImported } = require("../importers/importerCore.js");
const { mapSubodhaCourseToImported } = require("../importers/subodhaAdapter.js");

function parseArgs(argv) {
  const out = { force: false, undelete: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a === "--undelete") out.undelete = true;
    else if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      out[k] = v;
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.tenantId) {
    console.error("Required: --tenantId <ObjectId>");
    process.exit(2);
  }
  const sourceDir =
    args.source ||
    path.resolve(__dirname, "../../../subodha_exploration/pipeline/out");
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source dir not found: ${sourceDir}`);
    process.exit(2);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json") && f !== "all.json")
    .map((f) => path.join(sourceDir, f));

  console.log(`Importing ${files.length} files from ${sourceDir} for tenantId=${args.tenantId}`);
  await mongo();

  const stats = {
    created: 0, updated: 0, skipped: 0, errors: 0,
    blocksTotal: 0, preservedTotal: 0, empty: 0,
  };

  for (const f of files) {
    try {
      const raw = fs.readFileSync(f, "utf8");
      const rawJson = JSON.parse(raw);
      const adapter = mapSubodhaCourseToImported(rawJson, { filePath: f });
      const r = await upsertImported({
        vendorId: adapter.vendorId,
        tenantId: args.tenantId,
        sourceCourseId: adapter.sourceCourseId,
        sourceVersion: adapter.sourceVersion,
        title: adapter.title,
        theme: adapter.theme,
        language: adapter.language,
        adapted: adapter.adapted,
        force: args.force,
        undelete: args.undelete,
      });
      if (r.skipped) {
        stats.skipped++;
        console.log(`SKIP  ${path.basename(f)} — ${r.reason}`);
      } else {
        stats[r.action]++;
        stats.blocksTotal += r.blocks || 0;
        stats.preservedTotal += r.preserved || 0;
        if (r.empty) stats.empty++;
        console.log(
          `${r.action.toUpperCase().padEnd(5)} ${path.basename(f)} — _id=${r._id} blocks=${r.blocks}` +
          (r.preserved ? ` preserved=${r.preserved}` : "") +
          (r.empty ? " EMPTY" : "")
        );
      }
    } catch (e) {
      stats.errors++;
      console.error(`ERR  ${path.basename(f)}: ${e.message}`);
    }
  }

  console.log("\nSummary:", JSON.stringify(stats));
  process.exit(stats.errors ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
