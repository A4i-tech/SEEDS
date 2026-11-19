const MULTI_PART_SUFFIXES = [
  "co.uk",
  "org.uk",
  "ac.uk",
  "com.au",
  "edu.au",
  "co.in",
  "ac.in",
  "edu.in",
  "com.br",
];

export const deriveNameFromDomain = (domain) => {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const suffix = MULTI_PART_SUFFIXES.find((s) => host.endsWith(`.${s}`));
  const withoutTld = suffix
    ? host.slice(0, -(suffix.length + 1))
    : host.includes(".")
      ? host.slice(0, host.lastIndexOf("."))
      : host;
  return withoutTld
    .split(/[-_.]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
