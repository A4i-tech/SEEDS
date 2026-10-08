export function decodeJwtRole(token: string): string {
  return JSON.parse(atob(token.split('.')[1])).role;
}

export function isJwtExpired(token: string): boolean {
  return JSON.parse(atob(token.split('.')[1])).exp * 1000 <= Date.now();
}
