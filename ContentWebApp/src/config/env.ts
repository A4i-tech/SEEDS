const baseUrl = window.__ENV__?.REACT_APP_API_BASE_URL;

if (!baseUrl) throw new Error('Missing REACT_APP_API_BASE_URL in /env.js');

export const API_BASE_URL: string = baseUrl;
export const UMAMI_URL: string | undefined = import.meta.env.VITE_UMAMI_URL;
export const UMAMI_WEBSITE_ID: string | undefined = import.meta.env.VITE_UMAMI_WEBSITE_ID;
