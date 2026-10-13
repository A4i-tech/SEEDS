import path from 'node:path';

// Storage-state root stays at the repo <root>/playwright/.auth (one level deeper
// than before: this file moved from e2e/fixtures to tests/e2e/fixtures).
export function authFile(persona: string): string {
  return path.join(import.meta.dirname, '..', '..', '..', 'playwright', '.auth', `${persona}.json`);
}

export interface Instance {
  baseURL: string;
}

export const INSTANCES: Record<string, Instance> = {
  // v2 serves via `vite` (default port 5173); legacy CRA used :3000.
  local: {
    baseURL: 'http://localhost:5173',
  },
  // DELTA: these still point at the legacy CRA deployments — there are no v2
  // deployments at these hosts yet. E2E_INSTANCE=onrender/dev against v2 will
  // fail until v2 is deployed; update baseURLs then.
  onrender: {
    baseURL: 'https://contentwebapp.onrender.com',
  },
  dev: {
    baseURL: 'https://content-webapp-dev.a4i-lab.in',
  },
};

export function getInstance(name: string = process.env.E2E_INSTANCE || 'local'): Instance {
  const instance = INSTANCES[name];
  if (!instance) {
    throw new Error(`Unknown E2E_INSTANCE "${name}". Known instances: ${Object.keys(INSTANCES).join(', ')}`);
  }
  return instance;
}

export interface Persona {
  identifier: string;
  password: string;
}

export const PERSONAS: Record<string, Persona> = {
  tenant: { identifier: 'test@gmail.com', password: 'Test@123' },
  school: { identifier: 'school@test-a4i.local', password: 'Test@123' },
  schoolA4I: { identifier: 'a4itestschool@iiitb.ac.in', password: 'Test@123' },
  contentCreator: { identifier: '9595959595', password: 'Test@123' },
  // Used only by auth.spec.ts's TC-AUTH-007/008 password-change tests — a persona
  // no other spec in this suite touches, so the mutation can never race another
  // file's login (see playwright.config.ts's workers:1 comment). Requires a real
  // account provisioned with this email/password on every backend instance
  // (local/onrender/dev) — this alone doesn't create it.
  // DELTA vs prior e2e/ tree: tenant2 dropped — sync.spec.ts carries its own
  // local TENANT2 const and no spec imports PERSONAS.tenant2.
  tenantPasswordTest: { identifier: 'e2e-password-test@iiitb.ac.in', password: 'Test@123' },
};

let phoneCounter = 0;
export function uniquePhone(): string {
  // Date.now() alone can collide if called twice in the same millisecond (e.g.
  // generating two throwaway phone numbers back-to-back in one test); a counter
  // suffix keeps every call unique within a run regardless of timing.
  phoneCounter += 1;
  return `9${String(Date.now() + phoneCounter).slice(-9)}`;
}

let idCounter = 0;
export function uniqueId(): string {
  idCounter += 1;
  return String(Date.now() + idCounter).slice(-8);
}
