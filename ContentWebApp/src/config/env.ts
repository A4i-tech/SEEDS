const baseUrl = import.meta.env.VITE_API_BASE_URL;

if (!baseUrl) throw new Error('VITE_API_BASE_URL is not set');

export const API_BASE_URL: string = baseUrl;
export const UMAMI_URL: string | undefined = import.meta.env.VITE_UMAMI_URL;
export const UMAMI_WEBSITE_ID: string | undefined = import.meta.env.VITE_UMAMI_WEBSITE_ID;
