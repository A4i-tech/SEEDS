export const LANGUAGE_LABELS = {
  en: "English",
  kn: "Kannada",
  hi: "Hindi",
  bn: "Bengali",
  ta: "Tamil",
  mr: "Marathi",
  or: "Odia",
};

/**
 * Returns the human-readable display label for an ISO 639-1 language code.
 * Falls back to capitalizing the code if unmapped (e.g. "xx" → "Xx").
 */
export const getLanguageLabel = (iso) => {
  if (!iso) return "";
  return (
    LANGUAGE_LABELS[iso.toLowerCase()] ||
    iso.charAt(0).toUpperCase() + iso.slice(1).toLowerCase()
  );
};
