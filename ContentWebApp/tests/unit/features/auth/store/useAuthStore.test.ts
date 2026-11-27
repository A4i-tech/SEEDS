import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login, logout, refresh } from '@features/auth/api/login';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { authHeaders } from '@shared/services/apiClient';
import { identify, track } from '@shared/services/umami';
import { makeToken } from '../../../test-utils/makeToken';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('@features/auth/api/login', () => ({ login: vi.fn(), logout: vi.fn(), refresh: vi.fn() }));
vi.mock('@shared/services/umami', () => ({ identify: vi.fn(), track: vi.fn() }));

const FUTURE = Math.floor(Date.now() / 1000) + 3600;

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: '', status: 'unauthenticated' });
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('auth headers', () => {
    it('returns the bearer header for the in-memory token', async () => {
      vi.mocked(login).mockResolvedValue(makeToken({ role: 'tenant', exp: FUTURE }));
      await useAuthStore.getState().login('id', 'pw');
      expect(authHeaders()).toEqual({ Authorization: `Bearer ${useAuthStore.getState().token}` });
    });

    it('returns no headers when logged out', () => {
      expect(authHeaders()).toEqual({});
    });
  });

  describe('hydrate', () => {
    it('restores the session from a silent refresh', async () => {
      const token = makeToken({ role: 'tenant', id: 't1', exp: FUTURE });
      vi.mocked(refresh).mockResolvedValue(token);
      await useAuthStore.getState().hydrate();
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', role: 'tenant', token });
      expect(localStorage.length).toBe(0);
    });

    it('identifies the restored user to analytics without a login event', async () => {
      vi.mocked(refresh).mockResolvedValue(makeToken({ sub: 'u1', role: 'tenant', tenant_id: 'tn1', exp: FUTURE }));
      await useAuthStore.getState().hydrate();
      expect(identify).toHaveBeenCalledWith('u1', { role: 'tenant', schoolId: '', tenantId: 'tn1' });
      expect(track).not.toHaveBeenCalled();
    });

    it('stays logged out when refresh fails', async () => {
      vi.mocked(refresh).mockRejectedValue(new Error('Unauthorized'));
      await useAuthStore.getState().hydrate();
      expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', token: '' });
      expect(identify).not.toHaveBeenCalled();
    });
  });

  describe('login / logout', () => {
    it('sends only id, role, school and tenant to analytics, then the login event', async () => {
      vi.mocked(login).mockResolvedValue(
        makeToken({ sub: 'u1', role: 'school_admin', school_id: 's1', tenant_id: 'tn1', name: 'N', phone: '9', exp: FUTURE }),
      );
      await useAuthStore.getState().login('id', 'pw');
      expect(identify).toHaveBeenCalledWith('u1', { role: 'school_admin', schoolId: 's1', tenantId: 'tn1' });
      expect(track).toHaveBeenCalledWith('login');
    });

    it('persists the token in memory and never in localStorage', async () => {
      const token = makeToken({ role: 'content_creator', exp: FUTURE });
      vi.mocked(login).mockResolvedValue(token);
      await useAuthStore.getState().login('id', 'pw');
      expect(login).toHaveBeenCalledWith('id', 'pw');
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', role: 'content_creator' });
      expect(localStorage.length).toBe(0);
      expect(authHeaders()).toEqual({ Authorization: `Bearer ${token}` });
    });

    it('denies a teacher login without storing the token', async () => {
      vi.mocked(login).mockResolvedValue(makeToken({ role: 'teacher', exp: FUTURE }));
      await expect(useAuthStore.getState().login('id', 'pw')).rejects.toThrow('auth.roleNotAllowed');
      expect(useAuthStore.getState().token).toBe('');
      expect(useAuthStore.getState().status).not.toBe('authenticated');
    });

    it('logout revokes the server session and clears the in-memory token', async () => {
      vi.mocked(login).mockResolvedValue(makeToken({ role: 'tenant', exp: FUTURE }));
      await useAuthStore.getState().login('id', 'pw');
      vi.mocked(logout).mockResolvedValue();
      await expect(useAuthStore.getState().logout()).resolves.toBe(true);
      expect(logout).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', token: '' });
      expect(authHeaders()).toEqual({});
    });

    it('logout fails closed when revoke fails', async () => {
      const token = makeToken({ role: 'tenant', exp: FUTURE });
      vi.mocked(login).mockResolvedValue(token);
      await useAuthStore.getState().login('id', 'pw');
      vi.mocked(logout).mockRejectedValue(new Error('offline'));
      await expect(useAuthStore.getState().logout()).resolves.toBe(false);
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', token });
    });

    it('shares one in-flight refresh', async () => {
      let resolveRefresh!: (token: string) => void;
      vi.mocked(refresh).mockImplementation(() => new Promise((resolve) => (resolveRefresh = resolve)));
      const first = useAuthStore.getState().refresh();
      const second = useAuthStore.getState().refresh();
      expect(refresh).toHaveBeenCalledTimes(1);
      resolveRefresh(makeToken({ role: 'tenant', exp: FUTURE }));
      await expect(first).resolves.toBeTruthy();
      await expect(second).resolves.toBeTruthy();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('refresh rotates the in-memory token', async () => {
      const first = makeToken({ role: 'tenant', exp: FUTURE });
      const second = makeToken({ role: 'tenant', exp: FUTURE + 100 });
      vi.mocked(login).mockResolvedValue(first);
      await useAuthStore.getState().login('id', 'pw');
      vi.mocked(refresh).mockResolvedValue(second);
      await expect(useAuthStore.getState().refresh()).resolves.toBe(second);
      expect(useAuthStore.getState().token).toBe(second);
    });
  });
});
