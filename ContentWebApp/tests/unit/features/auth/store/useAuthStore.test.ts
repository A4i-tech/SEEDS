import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from '@features/auth/api/login';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { apiClient, authHeaders } from '@shared/services/apiClient';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('@features/auth/api/login', () => ({ login: vi.fn() }));
vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { post: vi.fn() },
}));

const FUTURE = Math.floor(Date.now() / 1000) + 3600;

function makeToken(payload: object) {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64}.sig`;
}

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
      vi.mocked(apiClient.post).mockResolvedValue({ data: { access_token: token } });
      useAuthStore.getState().hydrate();
      await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', role: 'tenant', token });
      expect(localStorage.length).toBe(0);
    });

    it('stays logged out when refresh fails', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Unauthorized'));
      useAuthStore.getState().hydrate();
      await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
      expect(useAuthStore.getState().token).toBe('');
    });
  });

  describe('login / logout', () => {
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
      vi.mocked(login).mockResolvedValue(makeToken({ role: 'teacher', exp: FUTURE }))
      await expect(useAuthStore.getState().login('id', 'pw')).rejects.toThrow('auth.roleNotAllowed')
      expect(useAuthStore.getState().token).toBe('')
      expect(useAuthStore.getState().status).not.toBe('authenticated')
    })

    it('logout clears the in-memory token', async () => {
      vi.mocked(login).mockResolvedValue(makeToken({ role: 'tenant', exp: FUTURE }));
      await useAuthStore.getState().login('id', 'pw');
      vi.mocked(apiClient.post).mockResolvedValue({ data: { message: 'Logout successful' } });
      await useAuthStore.getState().logout();
      expect(useAuthStore.getState()).toEqual(expect.objectContaining({ status: 'unauthenticated', token: '' }));
      expect(authHeaders()).toEqual({});
    });

    it('logout revokes the server session', async () => {
      vi.mocked(login).mockResolvedValue(makeToken({ role: 'tenant', exp: FUTURE }));
      await useAuthStore.getState().login('id', 'pw');
      vi.mocked(apiClient.post).mockResolvedValue({ data: { message: 'Logout successful' } });
      await useAuthStore.getState().logout();
      expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith('/tenant/logout');
    });

    it('logout fails closed when revoke fails', async () => {
      const token = makeToken({ role: 'tenant', exp: FUTURE });
      vi.mocked(login).mockResolvedValue(token);
      await useAuthStore.getState().login('id', 'pw');
      vi.mocked(apiClient.post).mockRejectedValue(new Error('offline'));
      await expect(useAuthStore.getState().logout()).resolves.toBe(false);
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', token });
    });

    it('shares one in-flight refresh', async () => {
      let resolvePost!: (value: unknown) => void;
      vi.mocked(apiClient.post).mockImplementation(() => new Promise((resolve) => (resolvePost = resolve)));
      const first = useAuthStore.getState().refresh();
      const second = useAuthStore.getState().refresh();
      expect(vi.mocked(apiClient.post)).toHaveBeenCalledTimes(1);
      resolvePost({ data: { access_token: makeToken({ role: 'tenant', exp: FUTURE }) } });
      await expect(first).resolves.toBeTruthy();
      await expect(second).resolves.toBeTruthy();
      expect(vi.mocked(apiClient.post)).toHaveBeenCalledTimes(1);
    });

    it('refresh rotates the in-memory token', async () => {
      const first = makeToken({ role: 'tenant', exp: FUTURE });
      const second = makeToken({ role: 'tenant', exp: FUTURE + 100 });
      vi.mocked(login).mockResolvedValue(first);
      await useAuthStore.getState().login('id', 'pw');
      vi.mocked(apiClient.post).mockResolvedValue({ data: { access_token: second } });
      await expect(useAuthStore.getState().refresh()).resolves.toBe(second);
      expect(useAuthStore.getState().token).toBe(second);
    });
  });
});
