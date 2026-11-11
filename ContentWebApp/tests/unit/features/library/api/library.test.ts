import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { deleteContent, getContentById, getContentPage, getCourses, updateContent } from '../../../../../src/features/library/api/library';

vi.mock('@shared/services/apiClient', () => ({
  apiClient: { get: vi.fn(), delete: vi.fn(), patch: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedDelete = vi.mocked(apiClient.delete);
const mockedPatch = vi.mocked(apiClient.patch);

const story = (overrides = {}) => ({ id: 'a1', language: 'en', type: 'story', ...overrides });

describe('library api (contentService port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleteContent calls DELETE on /content/:id regardless of type', async () => {
    mockedDelete.mockResolvedValue({ data: undefined });
    await deleteContent('quiz-123');
    expect(mockedDelete).toHaveBeenCalledWith('/content/quiz-123');
    await deleteContent('story-123');
    expect(mockedDelete).toHaveBeenCalledWith('/content/story-123');
  });

  it('getContentPage fetches with default limit 20 and parses items/pagination', async () => {
    mockedGet.mockResolvedValue({
      data: {
        data: [story({ id: 'a1' }), story({ id: 'b2' })],
        pagination: { next_cursor: 'c', limit: 20 },
      },
    });
    const out = await getContentPage('');
    expect(mockedGet).toHaveBeenCalledWith('/content', { params: { cursor: '', limit: 20 } });
    expect(out.data.map((i) => i.id)).toEqual(['a1', 'b2']);
    expect(out.pagination.next_cursor).toBe('c');
  });

  it('getContentPage includes cursor when provided', async () => {
    mockedGet.mockResolvedValue({ data: { data: [], pagination: { limit: 10 } } });
    await getContentPage('CUR', 10);
    expect(mockedGet).toHaveBeenCalledWith('/content', { params: { cursor: 'CUR', limit: 10 } });
  });

  it('getContentPage leaves a missing next_cursor undefined', async () => {
    mockedGet.mockResolvedValue({ data: { data: [], pagination: { limit: 10 } } });
    const out = await getContentPage('', 10);
    expect(out.pagination.next_cursor).toBeUndefined();
  });

  it('getCourses sends cursor and limit and parses the page', async () => {
    mockedGet.mockResolvedValue({ data: { courses: [{ id: 'k1', name: 'K1' }], next_cursor: 'k1' } });
    const out = await getCourses('CUR', 50);
    expect(mockedGet).toHaveBeenCalledWith('/content-aggregators/courses', { params: { cursor: 'CUR', limit: 50 } });
    expect(out.courses.map((c) => c.id)).toEqual(['k1']);
    expect(out.next_cursor).toBe('k1');
  });

  it('updateContent PATCHes with is_audio_uploaded param', async () => {
    mockedPatch.mockResolvedValue({ data: story({ id: 'x', description: 'd' }) });
    await updateContent('x', { description: 'd' }, true);
    expect(mockedPatch).toHaveBeenCalledWith(
      '/content/x',
      expect.objectContaining({ id: 'x', description: 'd' }),
      { params: { is_audio_uploaded: true } },
    );
  });

  it('getContentById encodes the id', async () => {
    mockedGet.mockResolvedValue({ data: story({ id: 'x y' }) });
    const out = await getContentById('x y');
    expect(mockedGet).toHaveBeenCalledWith('/content/x%20y');
    expect(out.id).toBe('x y');
  });
});
