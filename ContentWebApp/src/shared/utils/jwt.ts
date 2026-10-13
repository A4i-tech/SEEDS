function payload(token: string) {
  return JSON.parse(atob(token.split('.')[1]));
}

export function decodeJwtRole(token: string): string {
  return payload(token).role;
}

export function isJwtExpired(token: string): boolean {
  return payload(token).exp * 1000 <= Date.now();
}
