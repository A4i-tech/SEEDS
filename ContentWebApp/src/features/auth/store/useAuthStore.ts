import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { create } from 'zustand';
import i18n from '@shared/i18n';
import { queryClient } from '@shared/services/queryClient';
import { apiClient, setRefreshHandler, setSessionExpiredHandler, setTokenGetter } from '@shared/services/apiClient';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { decodeJwtPayload, decodeJwtRole, decodeJwtSchoolId, roleSchema, type Role } from '@shared/utils/jwt';
import { login as loginRequest } from '../api/login';

let inflightRefresh: Promise<string> | undefined;

interface Session {
  status: 'authenticated';
  token: string;
  role: Role;
  schoolId: string;
}

type AuthState = ({ token: string } & (Session | { status: 'idle' | 'unauthenticated' })) & {
  hydrate: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<boolean>;
  refresh: () => Promise<string>;
};

function signedIn(token: string) {
  return {
    status: 'authenticated',
    token,
    role: decodeJwtRole(token),
    schoolId: decodeJwtSchoolId(token),
  } as const;
}

export const useAuthStore = create<AuthState>((set) => {
  const actions = {
    hydrate: async () => {
      try {
        await useAuthStore.getState().refresh();
      } catch {
        set({ ...actions, token: '', status: 'unauthenticated' }, true);
      }
    },

    login: async (identifier: string, password: string) => {
      const token = await loginRequest(identifier, password);
      if (!roleSchema.safeParse(decodeJwtPayload(token).role).success) throw new Error(i18n.t('auth.roleNotAllowed'));
      set({ ...actions, ...signedIn(token) }, true);
    },

    logout: async (): Promise<boolean> => {
      try {
        await apiClient.post('/tenant/logout');
      } catch (err) {
        notifyApiError(err as Error);
        return false;
      }
      set({ ...actions, token: '', status: 'unauthenticated' }, true);
      queryClient.clear();
      return true;
    },

    refresh: () => {
      if (!inflightRefresh) {
        inflightRefresh = (async () => {
          try {
            const { data } = await apiClient.post('/auth/token/refresh');
            const token = z.object({ access_token: z.string() }).parse(data).access_token;
            set({ ...actions, ...signedIn(token) }, true);
            return token;
          } finally {
            inflightRefresh = undefined;
          }
        })();
      }
      return inflightRefresh;
    },
  };

  return { ...actions, token: '', status: 'idle' };
});

function requireSession(state: AuthState): Session {
  if (state.status !== 'authenticated') throw new Error('Not authenticated');
  return state;
}

export const getSession = () => requireSession(useAuthStore.getState());
export const useRole = () => useAuthStore((s) => requireSession(s).role);
export const useSchoolId = () => useAuthStore((s) => requireSession(s).schoolId);

setTokenGetter(() => useAuthStore.getState().token);
setRefreshHandler(() => useAuthStore.getState().refresh());
setSessionExpiredHandler(() => {
  notifications.show({ color: 'red', message: i18n.t('auth.sessionExpired') });
  void useAuthStore.getState().logout();
});
