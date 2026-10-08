function required(name: string): string {
  const value: unknown = import.meta.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const API_BASE_URL = required('VITE_API_BASE_URL');
