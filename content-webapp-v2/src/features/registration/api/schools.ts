import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import {
  schoolCreateSchema,
  schoolSchema,
  schoolUpdateSchema,
  type School,
  type SchoolCreate,
  type SchoolUpdate,
} from '../types/registration.types';

const schoolResponseSchema = schoolSchema.extend({ _id: z.string().optional() });

type SchoolResponse = z.infer<typeof schoolResponseSchema>;

function toSchool(raw: SchoolResponse): School {
  const { _id, ...rest } = raw;
  return { ...rest, id: rest.id ?? _id };
}

export async function getSchools(): Promise<School[]> {
  const { data } = await apiClient.get('/school');
  return z.array(schoolResponseSchema).parse(data).map(toSchool);
}

export async function createSchool(body: SchoolCreate): Promise<School> {
  const { data } = await apiClient.post('/school', schoolCreateSchema.parse(body));
  return toSchool(schoolResponseSchema.parse(data));
}

export async function updateSchool(id: string, body: SchoolUpdate): Promise<School> {
  const { data } = await apiClient.patch(
    `/school/${encodeURIComponent(id)}`,
    schoolUpdateSchema.parse(body),
  );
  return toSchool(schoolResponseSchema.parse(data));
}

export async function deleteSchool(id: string): Promise<void> {
  await apiClient.delete(`/school/${encodeURIComponent(id)}`);
}
