import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { websiteSchema, type Website, type WebsiteFields } from '../types/localize.types';

const websiteListSchema = z.array(websiteSchema);

export async function listSites(): Promise<Website[]> {
  const { data } = await apiClient.get('/websites');
  return websiteListSchema.parse(data);
}

export async function createSite(input: WebsiteFields): Promise<Website> {
  const { data } = await apiClient.post('/websites', input);
  return websiteSchema.parse(data);
}

export async function updateSite(id: string, fields: WebsiteFields): Promise<Website> {
  const { data } = await apiClient.put(`/websites/${encodeURIComponent(id)}`, fields);
  return websiteSchema.parse(data);
}

export async function deleteSite(id: string): Promise<void> {
  await apiClient.delete(`/websites/${encodeURIComponent(id)}`);
}
