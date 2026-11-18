import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { initUmami } from '@shared/utils/umami';

initUmami();

await useAuthStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
