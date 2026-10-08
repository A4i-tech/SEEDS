export const APP_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_BASE_URL,
  AUDIO_STORAGE_BASE_URL:
    process.env.REACT_APP_AUDIO_STORAGE_BASE_URL ||
    `https://${process.env.REACT_APP_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
};
