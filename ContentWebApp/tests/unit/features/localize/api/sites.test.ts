import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { getSite, listSites } from '../../../../../src/features/localize/api/sites';

vi.mock('@shared/services/apiClient', () => ({ apiClient: { get: vi.fn() } }));

const mockedGet = vi.mocked(apiClient.get);

describe('listSites (translationService/onboarding port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists sites with the default timeout (no explicit timeoutMs)', async () => {
    mockedGet.mockResolvedValue({ data: [{ id: 's1', domain: 'x', name: 'X' }] });
    const out = await listSites();
    expect(mockedGet).toHaveBeenCalledWith('/websites');
    expect(out[0].id).toBe('s1');
  });

  it('getSite fetches one site including api_base', async () => {
    mockedGet.mockResolvedValue({ data: { id: 's1', api_base: 'https://api.x' } });
    const out = await getSite('s1');
    expect(mockedGet).toHaveBeenCalledWith('/websites/s1');
    expect(out.api_base).toBe('https://api.x');
  });
});
