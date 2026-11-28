import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { listRules } from '../../../../../src/features/localize/api/rules';

vi.mock('@shared/services/apiClient', () => ({
  apiClient: { get: vi.fn() },
}));

const rule = { id: 'r1', kind: 'override', text: 'Dates', lang: 'hi', translation: 'tarikh' };

describe('localize rules api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listRules GETs the site rules and parses them', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [rule] });
    const out = await listRules('s1');
    expect(apiClient.get).toHaveBeenCalledWith('/translations/rules', { params: { site_id: 's1' } });
    expect(out).toEqual([rule]);
  });

  it('listRules rejects a row that is missing a field', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 'r1', kind: 'override', text: 'Dates' }] });
    await expect(listRules('s1')).rejects.toThrow();
  });
});
