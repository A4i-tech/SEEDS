const MULTI_PART_SUFFIXES = ['co.uk', 'org.uk', 'ac.uk', 'com.au', 'edu.au', 'co.in', 'ac.in', 'edu.in', 'com.br'];

export function deriveNameFromDomain(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, '');
  const suffix = MULTI_PART_SUFFIXES.find((s) => host.endsWith(`.${s}`));
  const lastDot = host.lastIndexOf('.');
  const withoutTld = suffix ? host.slice(0, -(suffix.length + 1)) : lastDot === -1 ? host : host.slice(0, lastDot);
  return withoutTld
    .split(/[-_.]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
