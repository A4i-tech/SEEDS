import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { ruleSchema, type Rule, type RuleFields } from '../types/localize.types';

export async function listRules(siteId: string): Promise<Rule[]> {
  const { data } = await apiClient.get('/translations/rules', { params: { site_id: siteId } });
  return z.array(ruleSchema).parse(data);
}

export async function createRule(siteId: string, fields: RuleFields): Promise<Rule> {
  const { data } = await apiClient.post('/translations/rules', fields, { params: { site_id: siteId } });
  return ruleSchema.parse(data);
}

export async function updateRule(id: string, fields: RuleFields): Promise<Rule> {
  const { data } = await apiClient.put(`/translations/rules/${encodeURIComponent(id)}`, fields);
  return ruleSchema.parse(data);
}

export async function deleteRule(id: string): Promise<void> {
  await apiClient.delete(`/translations/rules/${encodeURIComponent(id)}`);
}
