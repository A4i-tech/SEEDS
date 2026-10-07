function required(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const API_BASE_URL = required('VITE_API_BASE_URL');
