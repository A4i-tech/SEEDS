export const deriveNameFromDomain = (domain) => {
  const withoutTld = domain.includes(".") ? domain.slice(0, domain.lastIndexOf(".")) : domain;
  return withoutTld
    .split(/[-_.]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
