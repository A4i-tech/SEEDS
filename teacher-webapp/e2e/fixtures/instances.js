// @ts-check
const path = require('path');

function authFile(persona) {
  return path.join(__dirname, '..', '..', 'playwright', '.auth', `${persona}.json`);
}

const INSTANCES = {
  local: {
    baseURL: 'http://localhost:3000',
  },
  onrender: {
    baseURL: 'https://teacher-webapp.onrender.com',
  },
  // Unconfirmed: no teacher-webapp dev URL found in-repo; guessed from the ContentWebApp dev URL convention.
  dev: {
    baseURL: 'https://teacher-webapp-dev.a4i-lab.in',
  },
};

function getInstance(name = process.env.E2E_INSTANCE || 'dev') {
  const instance = INSTANCES[name];
  if (!instance) {
    throw new Error(`Unknown E2E_INSTANCE "${name}". Known instances: ${Object.keys(INSTANCES).join(', ')}`);
  }
  return instance;
}

// Teacher-webapp logs in with a phone number, so these are E2E_TEACHER_PHONE / E2E_TEACHER_PASSWORD, not *_EMAIL.
const PERSONAS = {
  get teacher() {
    const identifier = process.env.E2E_TEACHER_PHONE;
    const password = process.env.E2E_TEACHER_PASSWORD;
    if (!identifier || !password) {
      throw new Error('E2E_TEACHER_PHONE and E2E_TEACHER_PASSWORD must be set to run teacher-webapp E2E tests');
    }
    return { identifier, password };
  },
};

let classroomCounter = 0;
function uniqueClassroomName() {
  classroomCounter += 1;
  return `E2E Classroom ${Date.now()}-${classroomCounter}`;
}

let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  return `9${String(Date.now() + phoneCounter).slice(-9)}`;
}

module.exports = { INSTANCES, getInstance, PERSONAS, authFile, uniqueClassroomName, uniquePhone };
