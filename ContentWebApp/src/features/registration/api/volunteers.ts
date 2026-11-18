import { apiClient } from '@shared/services/apiClient';
import type { VolunteerRegister } from '../types/registration.types';

export async function registerVolunteer(body: VolunteerRegister): Promise<void> {
  await apiClient.post('/tenant/volunteers', body);
}
