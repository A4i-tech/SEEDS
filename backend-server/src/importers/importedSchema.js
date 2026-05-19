"use strict";
/**
 * ajv schema for the `imported` sub-document on ContentV3.
 * Importer core validates adapter output against this BEFORE any Mongo write.
 *
 * Schema is intentionally permissive about `body` and `vendorMeta` (both Mixed)
 * but strict about tree/blocks structure + the identity contract.
 */

const Ajv = require("ajv");

const BLOCK_TYPES = [
  "html", "quiz", "video", "audio", "file", "embed", "assignment", "discussion",
];

const ImportedSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "source", "status", "tree", "blocks"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    source: {
      type: "object",
      additionalProperties: true,
      properties: {
        org: { type: "string" },
        courseCode: { type: "string" },
        run: { type: "string" },
        importedFrom: { type: "string" },
        importedAt: {}, // Date or ISO string
      },
    },
    status: { type: "string", enum: ["ok", "empty", "partial", "deleted"] },
    detectedScripts: { type: "array", items: { type: "string" } },
    vendorMeta: {}, // Mixed — adapter free-form course-level extras

    tree: {
      type: "array",
      items: { $ref: "#/definitions/treeNode" },
    },

    blocks: {
      type: "object",
      // Map keyed by _seedsBlockId; values are block records.
      patternProperties: {
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$": {
          $ref: "#/definitions/blockRecord",
        },
      },
      additionalProperties: false,
    },
  },

  definitions: {
    treeNode: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "_seedsBlockId", "sourceId"],
      properties: {
        kind: { type: "string", enum: ["container", "block"] },
        _seedsBlockId: { type: "string", minLength: 8 },
        sourceId: { type: "string" },
        displayName: { type: "string" },
        children: { type: "array", items: { $ref: "#/definitions/treeNode" } },
      },
    },

    blockRecord: {
      type: "object",
      additionalProperties: false,
      required: ["sourceId", "blockType", "blockVersion"],
      properties: {
        sourceId: { type: "string" },
        blockType: { type: "string", enum: BLOCK_TYPES },
        displayName: { type: "string" },
        body: {}, // Mixed — content slots vary by blockType
        vendorMeta: {}, // Mixed
        translations: { type: "object", additionalProperties: true },
        audioByLang: { type: "object", additionalProperties: { type: "string" } },
        notes: { type: "string" },
        blockVersion: { type: "integer", minimum: 1 },
        updatedBy: { type: "string" },
        updatedAt: {},
        removedInSourceAt: {},
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(ImportedSchema);

function validateImported(imported) {
  const ok = validate(imported);
  if (ok) return { valid: true };
  return {
    valid: false,
    errors: (validate.errors || []).map((e) => `${e.instancePath || "/"} ${e.message}`),
  };
}

module.exports = { ImportedSchema, BLOCK_TYPES, validateImported };
