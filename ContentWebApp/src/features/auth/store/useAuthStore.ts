import { notifications } from '@mantine/notifications';
import { create } from 'zustand';
import i18n from '@shared/i18n';
import { queryClient } from '@app/store/queryClient';
import { setAuthToken, setSessionExpiredHandler } from '@shared/services/apiClient';
import { decodeJwtRole, decodeJwtSchoolId, isJwtExpired, type Role } from '@shared/utils/jwt';
import { login as loginRequest } from '../api/login';

const TOKEN_KEY = 'seeds.auth.token';

interface Session {
  status: 'authenticated';
  role: Role;
  schoolId: string;
}

type AuthState = (Session | { status: 'idle' | 'unauthenticated' }) & {
  hydrate: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
};

function readStoredToken(): string {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return '';
  try {
    if (isJwtExpired(token)) throw new Error('Stored auth token has expired');
    return token;
  } catch (err) {
    console.error(String(err));
    localStorage.removeItem(TOKEN_KEY);
    notifications.show({ color: 'red', message: i18n.t('auth.sessionExpired') });
    return '';
  }
}

export const useAuthStore = create<AuthState>((set) => {
  const signedIn = (token: string) => {
    setAuthToken(token);
    set({ ...actions, status: 'authenticated', role: decodeJwtRole(token), schoolId: decodeJwtSchoolId(token) }, true);
  };

  const actions = {
    hydrate: () => {
      const token = readStoredToken();
      if (!token) {
        set({ ...actions, status: 'unauthenticated' }, true);
        return;
      }
      signedIn(token);
    },

    login: async (identifier: string, password: string) => {
      const token = await loginRequest(identifier, password);
      localStorage.setItem(TOKEN_KEY, token);
      signedIn(token);
    },

    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      setAuthToken('');
      set({ ...actions, status: 'unauthenticated' }, true);
      queryClient.clear();
    },
  };

  return { ...actions, status: 'idle' };
});

function requireSession(state: AuthState): Session {
  if (state.status !== 'authenticated') throw new Error('Not authenticated');
  return state;
}

export const getSession = () => requireSession(useAuthStore.getState());
export const useRole = () => useAuthStore((s) => requireSession(s).role);
export const useSchoolId = () => useAuthStore((s) => requireSession(s).schoolId);

setSessionExpiredHandler(() => {
  notifications.show({ color: 'red', message: i18n.t('auth.sessionExpired') });
  useAuthStore.getState().logout();
});
