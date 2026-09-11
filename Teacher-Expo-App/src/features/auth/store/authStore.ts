import { create } from 'zustand';
import { setAuthToken, setSessionExpiredHandler } from '@shared/services/apiClient';
import { queryClient } from '@shared/services/queryClient';
import { secureStorage } from '@shared/services/secureStorage';
import { login as loginRequest } from '../api/login';

const TOKEN_KEY = 'authToken';

interface AuthState {
  status: 'idle' | 'authenticated' | 'unauthenticated';
  hydrate: () => Promise<void>;
  login: (phoneNumber: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',

  hydrate: async () => {
    const token = await secureStorage.getItemAsync(TOKEN_KEY);
    setAuthToken(token);
    set({ status: token ? 'authenticated' : 'unauthenticated' });
  },

  login: async (phoneNumber, password) => {
    const token = await loginRequest(phoneNumber, password);
    await secureStorage.setItemAsync(TOKEN_KEY, token);
    setAuthToken(token);
    set({ status: 'authenticated' });
  },

  logout: async () => {
    await secureStorage.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    set({ status: 'unauthenticated' });
    queryClient.clear();
  },
}));

setSessionExpiredHandler(() => {
  useAuthStore.getState().logout();
});
