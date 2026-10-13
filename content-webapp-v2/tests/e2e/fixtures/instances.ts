import path from 'node:path';

export function authFile(persona: string): string {
  return path.join(import.meta.dirname, '..', '..', '..', 'playwright', '.auth', `${persona}.json`);
}

export interface Instance {
  baseURL: string;
}

export const INSTANCES: Record<string, Instance> = {
  local: {
    baseURL: 'http://localhost:5173',
  },
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
  tenantPasswordTest: { identifier: 'e2e-password-test@iiitb.ac.in', password: 'Test@123' },
};

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter += 1;
  return `9${String(Date.now() + phoneCounter).slice(-9)}`;
}

let idCounter = 0;
export function uniqueId(): string {
  idCounter += 1;
  return String(Date.now() + idCounter).slice(-8);
}
