export function selectValue(value: unknown): string;
export function selectValue<T extends string>(value: unknown, fallback: T): T;
export function selectValue(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value;
}
