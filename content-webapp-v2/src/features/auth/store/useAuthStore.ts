import { create } from 'zustand';
import { queryClient } from '@app/store/queryClient';
import { clearAuthToken, setAuthToken, setSessionExpiredHandler } from '@shared/services/apiClient';
import { decodeJwtRole, isJwtExpired } from '@shared/utils/jwt';
import { login as loginRequest } from '../api/login';

const TOKEN_KEY = 'seeds.auth.token';

interface AuthState {
  status: 'idle' | 'authenticated' | 'unauthenticated';
  role: string;
  hydrate: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

function readStoredToken(): string {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return '';
  try {
    if (isJwtExpired(token)) throw new Error('Stored auth token has expired');
    return token;
  } catch (err) {
    console.error(String(err));
    localStorage.removeItem(TOKEN_KEY);
    return '';
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  role: '',

  hydrate: () => {
    const token = readStoredToken();
    if (!token) {
      clearAuthToken();
      set({ status: 'unauthenticated', role: '' });
      return;
    }
    setAuthToken(token);
    set({ status: 'authenticated', role: decodeJwtRole(token) });
  },

  login: async (identifier, password) => {
    const token = await loginRequest(identifier, password);
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    set({ status: 'authenticated', role: decodeJwtRole(token) });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    clearAuthToken();
    set({ status: 'unauthenticated', role: '' });
    queryClient.clear();
  },
}));

setSessionExpiredHandler(() => {
  useAuthStore.getState().logout();
});
