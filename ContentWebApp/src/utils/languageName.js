const displayNames =
  typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "language" }) : null;

/**
 * Resolve a language code (e.g. "en", "eng") to its display name (e.g. "English").
 * Falls back to the original value when it isn't a resolvable language tag.
 * @param {string} code
 * @returns {string}
 */
export const getLanguageName = (code) => {
  if (!code) return code;
  try {
    return displayNames?.of(code) || code;
  } catch {
    return code;
  }
};
