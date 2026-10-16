import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import {
  schoolSchema,
  type School,
  type SchoolCreate,
  type SchoolUpdate,
} from '../types/registration.types';

export async function getSchools(): Promise<School[]> {
  const { data } = await apiClient.get('/school');
  return z.array(schoolSchema).parse(data);
}

export async function createSchool(body: SchoolCreate): Promise<School> {
  const { data } = await apiClient.post('/school', body);
  return schoolSchema.parse(data);
}

export async function updateSchool(id: string, body: SchoolUpdate): Promise<School> {
  const { data } = await apiClient.patch(`/school/${encodeURIComponent(id)}`, body);
  return schoolSchema.parse(data);
}

export async function deleteSchool(id: string): Promise<void> {
  await apiClient.delete(`/school/${encodeURIComponent(id)}`);
}
