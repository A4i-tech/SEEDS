export function fileFromInput(value: unknown): File | undefined {
  if (value instanceof File) return value;
  return undefined;
}
