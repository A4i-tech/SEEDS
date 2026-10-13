import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { createQuiz } from '../../../../src/features/create/api/quiz';

vi.mock('@shared/services/apiClient', () => ({ apiClient: { post: vi.fn() } }));

const mockedPost = vi.mocked(apiClient.post);

describe('createQuiz', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs serialized quiz data to /content/quiz', async () => {
    mockedPost.mockResolvedValue({ data: undefined });
    const payload = { type: 'quiz', language: 'en' };
    await createQuiz(payload);
    expect(mockedPost).toHaveBeenCalledWith('/content/quiz', payload);
  });
});
