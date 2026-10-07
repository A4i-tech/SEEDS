import { create } from 'zustand';
import { queryClient } from '@app/store/queryClient';
import { clearAuthToken, setAuthToken, setSessionExpiredHandler } from '@shared/services/apiClient';
import { decodeJwtRole } from '@shared/utils/jwt';
import { login as loginRequest } from '../api/login';

const TOKEN_KEY = 'seeds.auth.token';

interface AuthState {
  status: 'idle' | 'authenticated' | 'unauthenticated';
  role: string | null;
  hydrate: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  role: null,

  hydrate: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    setAuthToken(token);
    set({ status: token ? 'authenticated' : 'unauthenticated', role: decodeJwtRole(token) });
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
    set({ status: 'unauthenticated', role: null });
    queryClient.clear();
  },
}));

setSessionExpiredHandler(() => {
  useAuthStore.getState().logout();
});
