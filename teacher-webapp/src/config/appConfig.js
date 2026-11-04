for (const key of ["REACT_APP_API_BASE_URL", "REACT_APP_STORAGE_ACCOUNT_NAME"]) {
  if (window.__ENV__[key] === undefined) throw new Error(`Missing ${key} in /env.js`);
}

export const APP_CONFIG = {
  BASE_URL: window.__ENV__.REACT_APP_API_BASE_URL,
  STORAGE_ACCOUNT_NAME: window.__ENV__.REACT_APP_STORAGE_ACCOUNT_NAME,
};
