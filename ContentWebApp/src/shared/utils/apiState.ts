import type { UseQueryResult } from '@tanstack/react-query';

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'done'; data: T };

export function toApiState<T>(query: Pick<UseQueryResult<T, Error>, 'data' | 'error'>): ApiState<T> {
  if (query.error) return { status: 'error', error: query.error };
  if (query.data === undefined) return { status: 'loading' };
  return { status: 'done', data: query.data };
}

export function combineStates<T extends Record<string, unknown>>(states: {
  [K in keyof T]: ApiState<T[K]>;
}): ApiState<T> {
  for (const state of Object.values(states)) {
    if (state.status === 'error') return state as ApiState<T>;
  }
  for (const state of Object.values(states)) {
    if (state.status === 'loading') return { status: 'loading' };
  }
  const data = Object.fromEntries(
    Object.entries(states).map(([key, state]) => [key, (state as { data: unknown }).data]),
  ) as T;
  return { status: 'done', data };
}
