import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import {
  schoolSchema,
  type School,
  type SchoolCreate,
  type SchoolUpdate,
} from '../types/registration.types';

const schoolResponseSchema = schoolSchema
  .omit({ id: true })
  .extend({ id: z.string().optional(), _id: z.string().optional() })
  .transform(({ id, _id, ...rest }) => schoolSchema.parse({ ...rest, id: id ?? _id }));

export async function getSchools(): Promise<School[]> {
  const { data } = await apiClient.get('/school');
  return z.array(schoolResponseSchema).parse(data);
}

export async function createSchool(body: SchoolCreate): Promise<School> {
  const { data } = await apiClient.post('/school', body);
  return schoolResponseSchema.parse(data);
}

export async function updateSchool(id: string, body: SchoolUpdate): Promise<School> {
  const { data } = await apiClient.patch(`/school/${encodeURIComponent(id)}`, body);
  return schoolResponseSchema.parse(data);
}

export async function deleteSchool(id: string): Promise<void> {
  await apiClient.delete(`/school/${encodeURIComponent(id)}`);
}
