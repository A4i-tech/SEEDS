import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import {
  websiteSchema,
  type Website,
  type WebsiteCreate,
  type WebsiteUpdate,
} from '../types/localize.types';

const websiteListSchema = z.array(websiteSchema);

export async function listSites(): Promise<Website[]> {
  const { data } = await apiClient.get('/websites');
  return websiteListSchema.parse(data);
}

export async function getSite(id: string): Promise<Website> {
  const { data } = await apiClient.get(`/websites/${encodeURIComponent(id)}`);
  return websiteSchema.parse(data);
}

export async function createSite(input: WebsiteCreate): Promise<Website> {
  const { data } = await apiClient.post('/websites', input);
  return websiteSchema.parse(data);
}

export async function updateSite(id: string, fields: WebsiteUpdate): Promise<Website> {
  const { data } = await apiClient.put(`/websites/${encodeURIComponent(id)}`, fields);
  return websiteSchema.parse(data);
}

export async function deleteSite(id: string): Promise<void> {
  await apiClient.delete(`/websites/${encodeURIComponent(id)}`);
}
