for (const key of ["REACT_APP_API_BASE_URL", "REACT_APP_STORAGE_ACCOUNT_NAME"]) {
  if (window.__ENV__[key] === undefined) throw new Error(`Missing ${key} in /env.js`);
}
export const SEEDS_URL = window.__ENV__.REACT_APP_API_BASE_URL;
export const STORAGE_ACCOUNT_NAME = window.__ENV__.REACT_APP_STORAGE_ACCOUNT_NAME;
export const AUDIO_BASE_URL = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/output-original`;
export const USER_ROLES = {
  TEACHER: "teacher",
  CONTENT_CREATOR: "content_creator",
  TENANT: "tenant",
  SCHOOL_ADMIN: "school_admin",
};
