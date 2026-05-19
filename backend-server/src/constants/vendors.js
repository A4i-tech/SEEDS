"use strict";
/**
 * Vendor registry — the sole place where vendor brand strings appear in SEEDS code.
 *
 * Data layer uses OPAQUE numeric vendor IDs (`vendor_1`, `vendor_2`, ...).
 * Brand names, URLs, glyphs, and adapter module pointers live here.
 *
 * Adding a new vendor:
 *   1. Pick the next free vendor_<n> key.
 *   2. Append the entry below.
 *   3. Ship an adapter under `backend-server/src/importers/<adapterName>.js`.
 *   No schema, route, or frontend changes required.
 */

const VENDORS = Object.freeze({
  vendor_1: {
    name: "Subodha LMS",
    organization: "VisionEmpower Trust",
    baseUrl: "https://subodha-lms.visionempowertrust.org",
    adapter: "subodhaAdapter",
    glyph: "✦",
    aria: "Subodha LMS imported course",
  },
  // Add new vendors here. Example:
  // vendor_2: {
  //   name: "Antara LMS",
  //   organization: "Antara Foundation",
  //   baseUrl: "https://...",
  //   adapter: "antaraAdapter",
  //   glyph: "✺",
  //   aria: "Antara LMS imported course",
  // },
});

const VENDOR_IDS = Object.freeze(Object.keys(VENDORS));

function getVendor(vendorId) {
  return VENDORS[vendorId] || null;
}

function isValidVendorId(vendorId) {
  return typeof vendorId === "string" && Object.prototype.hasOwnProperty.call(VENDORS, vendorId);
}

// Public-facing slice — what the frontend gets from GET /content/vendors.
// Drops `adapter` (internal module pointer).
function getPublicVendorMap() {
  const out = {};
  for (const [id, v] of Object.entries(VENDORS)) {
    out[id] = { name: v.name, organization: v.organization, glyph: v.glyph, aria: v.aria };
  }
  return out;
}

module.exports = {
  VENDORS,
  VENDOR_IDS,
  getVendor,
  isValidVendorId,
  getPublicVendorMap,
};
