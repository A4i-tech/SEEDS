/**
 * Export utility functions for downloading data as CSV or JSON files
 */

/**
 * Trigger a browser download for a blob
 * @param {Blob} blob - File contents
 * @param {string} filename - Full filename including extension
 */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Convert array of objects to CSV and trigger download
 * @param {Array} data - Array of objects to export
 * @param {Array} headers - Array of keys to use as column headers
 * @param {string} filename - Name for the downloaded file (without extension)
 */
export const exportToCSV = (data, headers, filename) => {
  if (!data || data.length === 0) {
    console.warn("No data to export");
    return;
  }

  // Create CSV header row
  const headerRow = headers.join(",");

  // Create CSV data rows
  const dataRows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        const doubleQuote = String.fromCharCode(34);
        // Handle values with commas or quotes
        if (typeof value === "string" && (value.includes(",") || value.includes(doubleQuote))) {
          return `"${value.replace(/"/g, doubleQuote + doubleQuote)}"`;
        }
        return value;
      })
      .join(",")
  );

  // Combine header and data
  const csvContent = [headerRow, ...dataRows].join("\n");

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export array of objects as JSON and trigger download
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Name for the downloaded file (without extension)
 */
export const exportToJSON = (data, filename) => {
  if (!data || data.length === 0) {
    console.warn("No data to export");
    return;
  }

  // Stringify with formatting
  const jsonContent = JSON.stringify(data, null, 2);

  // Create blob and trigger download
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.json`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
