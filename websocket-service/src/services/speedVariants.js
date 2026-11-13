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

module.exports = { getVariantBlobName, formatSpeedLabel };
