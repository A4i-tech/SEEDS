import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../../../src/shared/services/apiClient';
import { getLanguages } from '../../../../src/shared/services/languages';

vi.mock('../../../../src/shared/services/apiClient', () => ({ apiClient: { get: vi.fn() } }));

const mockedGet = vi.mocked(apiClient.get);

describe('getLanguages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the static catalog from /v1/languages', async () => {
    mockedGet.mockResolvedValue({
      data: {
        languages: [
          { code: 'hi', name: 'Hindi' },
          { code: 'bn', name: 'Bengali' },
        ],
      },
    });

    const out = await getLanguages();

    expect(mockedGet).toHaveBeenCalledWith('/v1/languages');
    expect(out).toEqual([
      { code: 'hi', name: 'Hindi' },
      { code: 'bn', name: 'Bengali' },
    ]);
  });
});
