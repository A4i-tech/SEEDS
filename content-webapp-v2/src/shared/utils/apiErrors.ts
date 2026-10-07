import { z } from 'zod';

export function toApiErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    console.error(error.issues);
    return '';
  }
  return (error as { message?: string } | null)?.message ?? '';
}
