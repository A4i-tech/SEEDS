const runtimeEnv = (key) => (window.__ENV__ || {})[key] ?? process.env[key];

export const APP_CONFIG = {
  BASE_URL: runtimeEnv("REACT_APP_API_BASE_URL"),
  STORAGE_ACCOUNT_NAME: runtimeEnv("REACT_APP_STORAGE_ACCOUNT_NAME"),
};
