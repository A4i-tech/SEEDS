export const LANGUAGE_LABELS = {
  kn: "Kannada",
  hi: "Hindi",
  mr: "Marathi",
  or: "Odia",
  en: "English",
  ta: "Tamil",
  bn: "Bengali",
};

export const LANGUAGE_OPTIONS = Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label }));

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
