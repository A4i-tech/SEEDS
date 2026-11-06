import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { approveTranslation, bulkApproveTranslations, listTranslations, updateTranslation } from '../../../../../src/features/localize/api/review';

vi.mock('@shared/services/apiClient', () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPut = vi.mocked(apiClient.put);
const mockedPost = vi.mocked(apiClient.post);

const item = (overrides = {}) => ({ id: 't1', ...overrides });

describe('localize review api (translationService port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bulkApproveTranslations reuses the 5-minute generate timeout', async () => {
    mockedPost.mockResolvedValue({ data: { approved: 3 } });
    const out = await bulkApproveTranslations('s1', { route: '/', lang: 'hi' });
    expect(mockedPost).toHaveBeenCalledWith(
      '/translations/bulk-approve',
      { route: '/', lang: 'hi' },
      expect.objectContaining({ params: { site_id: 's1' }, timeoutMs: 300000 }),
    );
    expect(out).toEqual({ approved: 3 });
  });

  it('listTranslations uses the default timeout (no explicit timeoutMs)', async () => {
    mockedGet.mockResolvedValue({ data: [item()] });
    await listTranslations('s1', '/');
    expect(mockedGet).toHaveBeenCalledWith(
      '/translations/list',
      expect.objectContaining({ params: { site_id: 's1', route: '/' } }),
    );
    const [, options] = mockedGet.mock.calls[0];
    expect(options?.timeoutMs).toBeUndefined();
  });

  it('updateTranslation PUTs lang/text', async () => {
    mockedPut.mockResolvedValue({ data: item() });
    await updateTranslation('t1', { lang: 'hi', text: 'hello' });
    expect(mockedPut).toHaveBeenCalledWith('/translations/t1', { lang: 'hi', text: 'hello' });
  });

  it('approveTranslation POSTs lang', async () => {
    mockedPost.mockResolvedValue({ data: item() });
    await approveTranslation('t1', { lang: 'hi' });
    expect(mockedPost).toHaveBeenCalledWith('/translations/t1/approve', { lang: 'hi' });
  });
});
