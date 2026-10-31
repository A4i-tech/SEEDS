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
  // No confirmed teacher-webapp dev URL exists in-repo; set E2E_BASE_URL to run against dev.
  dev: {
    baseURL: null,
  },
};

function getInstance(name) {
  const instance = INSTANCES[name];
  if (!instance) {
    throw new Error(`Unknown E2E_INSTANCE "${name}". Known instances: ${Object.keys(INSTANCES).join(', ')}`);
  }
  if (process.env.E2E_BASE_URL) {
    console.log(`E2E_BASE_URL override: running "${name}" against ${process.env.E2E_BASE_URL}`);
    return { ...instance, baseURL: process.env.E2E_BASE_URL };
  }
  if (!instance.baseURL) {
    throw new Error(`No confirmed baseURL for E2E_INSTANCE "${name}". Set E2E_BASE_URL to run against it.`);
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

module.exports = { INSTANCES, getInstance, PERSONAS, authFile, uniqueClassroomName };
