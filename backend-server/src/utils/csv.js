"use strict";

function escapeCell(value) {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Serialize rows to CSV.
 * @param {Object[]} rows
 * @param {{key: string, header: string}[]} columns
 * @returns {string}
 */
function toCsv(rows, columns) {
    const header = columns.map((c) => escapeCell(c.header)).join(",");
    const lines = rows.map((row) =>
        columns.map((c) => escapeCell(row[c.key])).join(",")
    );
    return [header, ...lines].join("\n");
}

module.exports = { toCsv };
