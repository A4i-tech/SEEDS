import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { generateForReview } from '../../../../src/features/localize/api/scripts';

vi.mock('@shared/services/apiClient', () => ({ apiClient: { post: vi.fn() } }));

const mockedPost = vi.mocked(apiClient.post);

describe('generateForReview (translationService port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('overrides the default timeout with 5 minutes', async () => {
    mockedPost.mockResolvedValue({ data: undefined });
    await generateForReview('s1', '/', 'hi');
    expect(mockedPost).toHaveBeenCalledWith(
      '/translations/generate',
      undefined,
      expect.objectContaining({ timeoutMs: 300000, params: { site_id: 's1', route: '/', lang: 'hi' } }),
    );
  });
});
