import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { createRule, deleteRule, listRules, updateRule } from '../../../../../src/features/localize/api/rules';

vi.mock('@shared/services/apiClient', () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const rule = { id: 'r1', kind: 'override', text: 'Dates', lang: 'hi', translation: 'tarikh', updated_at: '', updated_by: 'u' };
const fields = { kind: 'override' as const, text: 'Dates', lang: 'hi', translation: 'tarikh' };

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

  it('createRule POSTs the fields for the site', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: rule });
    await createRule('s1', fields);
    expect(apiClient.post).toHaveBeenCalledWith('/translations/rules', fields, { params: { site_id: 's1' } });
  });

  it('updateRule PUTs the fields to the rule', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: rule });
    await updateRule('r1', fields);
    expect(apiClient.put).toHaveBeenCalledWith('/translations/rules/r1', fields);
  });

  it('deleteRule DELETEs the rule', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    await deleteRule('r1');
    expect(apiClient.delete).toHaveBeenCalledWith('/translations/rules/r1');
  });
});
