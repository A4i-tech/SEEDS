const commonLanguageCodes = ['kn', 'bn', 'hi', 'ta', 'te', 'mr', 'gu', 'or', 'pa', 'ur', 'as', 'ml', 'bho', 'kok', 'mai', 'ne', 'sa', 'sd'];

export function commonFirst<T extends { code: string }>(languages: T[]): T[] {
  const rank = (code: string) => {
    const i = commonLanguageCodes.indexOf(code);
    return i === -1 ? commonLanguageCodes.length : i;
  };
  return [...languages].sort((a, b) => rank(a.code) - rank(b.code));
}
