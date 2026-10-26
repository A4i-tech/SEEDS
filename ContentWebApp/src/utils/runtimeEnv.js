export const runtimeEnv = (key) => (window.__ENV__ || {})[key] ?? process.env[key];
