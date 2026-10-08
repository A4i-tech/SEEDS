export function toLocalized(english: string, local: string, needsLocal: boolean) {
  if (needsLocal) return { english, local };
  return { english, local: english };
}
