// @ts-check
const path = require('path');

function authFile(persona) {
  return path.join(__dirname, '..', '..', 'playwright', '.auth', `${persona}.json`);
}

const INSTANCES = {
  local: {
    baseURL: 'http://localhost:3000',
    apiBaseURL: process.env.REACT_APP_API_BASE_URL || 'https://seeds-6uxm.onrender.com',
  },
  onrender: {
    baseURL: 'https://contentwebapp.onrender.com',
    apiBaseURL: process.env.REACT_APP_API_BASE_URL || 'https://seeds-6uxm.onrender.com',
  },
  dev: {
    baseURL: 'https://content-webapp-dev.a4i-lab.in',
    apiBaseURL: process.env.REACT_APP_API_BASE_URL || 'https://seeds-6uxm.onrender.com',
  },
};

function getInstance(name = process.env.E2E_INSTANCE || 'local') {
  const instance = INSTANCES[name];
  if (!instance) {
    throw new Error(`Unknown E2E_INSTANCE "${name}". Known instances: ${Object.keys(INSTANCES).join(', ')}`);
  }
  return instance;
}

const PERSONAS = {
  tenant: { identifier: 'test@gmail.com', password: 'Test@123' },
  school: { identifier: 'school@test-a4i.local', password: 'Test@123' },
  schoolA4I: { identifier: 'a4itestschool@iiitb.ac.in', password: 'Test@123' },
  contentCreator: { identifier: '9595959595', password: 'Test@123' },
};

let phoneCounter = 0;
function uniquePhone() {
  // Date.now() alone can collide if called twice in the same millisecond (e.g.
  // generating two throwaway phone numbers back-to-back in one test); a counter
  // suffix keeps every call unique within a run regardless of timing.
  phoneCounter += 1;
  return `9${String(Date.now() + phoneCounter).slice(-9)}`;
}

let idCounter = 0;
function uniqueId() {
  // Content titles get middle-truncated in the UI (MiddleEllipsis.js) once they
  // don't fit the column width — a full generated title can vanish from a
  // hasText() match. The tail is always preserved by that truncation, so keep
  // this short and match on it directly rather than the full generated string.
  idCounter += 1;
  return String(Date.now() + idCounter).slice(-8);
}

module.exports = { INSTANCES, getInstance, PERSONAS, authFile, uniquePhone, uniqueId };
