export function makeToken(payload: object) {
  const b64 = btoa(JSON.stringify({ sub: 'user-1', ...payload })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64}.sig`;
}
