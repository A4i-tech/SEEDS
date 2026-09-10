const { SUPPORTED_SPEEDS } = require("../constants");

/**
 * Renders a speed value the same way Python's str(float) would, since it is
 * used as a literal blob-name suffix produced by content_job_consumer.py.
 */
function formatSpeedLabel(speed) {
  return Number.isInteger(speed) ? `${speed}.0` : `${speed}`;
}

/**
 * Derives the speed-variant blob name from the base (1.0x) blob name.
 * Mirrors _variant_blob_name in platform/app/consumers/content_job_consumer.py.
 */
function getVariantBlobName(baseBlobName, speed) {
  if (speed === 1.0) return baseBlobName;
  const label = formatSpeedLabel(speed);
  const lastDot = baseBlobName.lastIndexOf(".");
  return lastDot === -1
    ? `${baseBlobName}__speed_${label}`
    : `${baseBlobName.slice(0, lastDot)}__speed_${label}${baseBlobName.slice(lastDot)}`;
}

/**
 * Snaps an arbitrary requested speed to the nearest entry in SUPPORTED_SPEEDS,
 * since only discrete pre-generated variants exist.
 */
function snapToSupportedSpeed(speed) {
  return SUPPORTED_SPEEDS.reduce((closest, candidate) =>
    Math.abs(candidate - speed) < Math.abs(closest - speed) ? candidate : closest
  );
}

module.exports = { getVariantBlobName, snapToSupportedSpeed, formatSpeedLabel };
