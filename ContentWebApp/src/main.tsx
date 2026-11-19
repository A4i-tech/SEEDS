import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { initUmami } from '@shared/services/umami';
import { UMAMI_URL, UMAMI_WEBSITE_ID } from '@/config/env';

initUmami(UMAMI_URL, UMAMI_WEBSITE_ID);

await useAuthStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
