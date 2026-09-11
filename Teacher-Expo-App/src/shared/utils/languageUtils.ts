const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  kn: 'Kannada',
  hi: 'Hindi',
  bn: 'Bengali',
  ta: 'Tamil',
  mr: 'Marathi',
  or: 'Odia',
};

export function getLanguageLabel(iso: string): string {
  if (!iso) return '';
  const lower = iso.toLowerCase();
  return LANGUAGE_LABELS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}
