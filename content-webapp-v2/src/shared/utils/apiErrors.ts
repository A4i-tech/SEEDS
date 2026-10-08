import { z } from 'zod';

export function toApiErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return '';
  if (error instanceof z.ZodError) {
    console.error(error.issues);
    return `Unexpected server response (${error.issues.length} field(s))`;
  }
  if (error instanceof Error) return error.message === '' ? String(error) : error.message;
  return 'Request failed';
}
