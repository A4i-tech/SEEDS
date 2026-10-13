import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { login } from '@features/auth/api/login';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { authHeaders } from '@shared/services/apiClient';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('@features/auth/api/login', () => ({ login: vi.fn() }));

const TOKEN_KEY = 'seeds.auth.token';
const FUTURE = Math.floor(Date.now() / 1000) + 3600;

function makeToken(payload: object) {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64}.sig`;
}

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('auth headers', () => {
    it('returns the bearer header once a token is stored', () => {
      localStorage.setItem(TOKEN_KEY, makeToken({ role: 'tenant', exp: FUTURE }));
      useAuthStore.getState().hydrate();
      expect(authHeaders()).toEqual({ Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` });
    });

    it('returns no headers when no token', () => {
      expect(authHeaders()).toEqual({});
    });
  });

  describe('hydrate (isAuthenticated)', () => {
    it('authenticated when a valid token is present', () => {
      localStorage.setItem(TOKEN_KEY, makeToken({ role: 'tenant', exp: FUTURE }));
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().status).toBe('authenticated');
    });

    it('unauthenticated when absent', () => {
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', role: '' });
    });

    it('decodes the role from a valid token', () => {
      localStorage.setItem(TOKEN_KEY, makeToken({ role: 'tenant', id: 't1', exp: FUTURE }));
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().role).toBe('tenant');
    });

    it('discards a malformed token', () => {
      localStorage.setItem(TOKEN_KEY, 'not-a-jwt');
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', role: '' });
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(notifications.show).toHaveBeenCalled();
    });

    it('discards a token whose payload segment is missing', () => {
      localStorage.setItem(TOKEN_KEY, 'onlyonesegment');
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().status).toBe('unauthenticated');
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });

    it('discards an expired token', () => {
      localStorage.setItem(TOKEN_KEY, makeToken({ role: 'tenant', exp: 1 }));
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().status).toBe('unauthenticated');
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(notifications.show).toHaveBeenCalled();
    });
  });

  describe('login / logout', () => {
    it('persists the token and role from the token payload', async () => {
      const token = makeToken({ role: 'content_creator', exp: FUTURE });
      vi.mocked(login).mockResolvedValue(token);
      await useAuthStore.getState().login('id', 'pw');
      expect(login).toHaveBeenCalledWith('id', 'pw');
      expect(localStorage.getItem(TOKEN_KEY)).toBe(token);
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', role: 'content_creator' });
      expect(authHeaders()).toEqual({ Authorization: `Bearer ${token}` });
    });

    it('logout removes everything', async () => {
      vi.mocked(login).mockResolvedValue(makeToken({ role: 'tenant', exp: FUTURE }));
      await useAuthStore.getState().login('id', 'pw');
      useAuthStore.getState().logout();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', role: '' });
      expect(authHeaders()).toEqual({});
    });
  });
});
