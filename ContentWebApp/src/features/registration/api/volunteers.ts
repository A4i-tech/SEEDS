import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { volunteerSchema, type Volunteer, type VolunteerRegister } from '../types/registration.types';

export async function getVolunteers(): Promise<Volunteer[]> {
  const { data } = await apiClient.get('/tenant/volunteers');
  return z.array(volunteerSchema).parse(data);
}

export async function registerVolunteer(body: VolunteerRegister): Promise<void> {
  await apiClient.post('/tenant/volunteers', body);
}
