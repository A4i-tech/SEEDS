const baseUrl = window.__ENV__?.REACT_APP_API_BASE_URL;

if (!baseUrl) throw new Error('Missing REACT_APP_API_BASE_URL in /env.js');

export const API_BASE_URL: string = baseUrl;
