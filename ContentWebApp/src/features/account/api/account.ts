import { apiClient } from '@shared/services/apiClient';
import { getSession } from '@features/auth/store/useAuthStore';
import type { Role, volunteerRole } from '@shared/utils/jwt';
import { meSchema, type Me } from '../types/account.types';

const rolePaths: Record<Exclude<Role, typeof volunteerRole>, string> = {
  tenant: '/tenant',
  school_admin: '/school/admin',
  content_creator: '/teacher',
};

const rolePath = () => rolePaths[getSession().role as keyof typeof rolePaths];

export async function getMe(): Promise<Me> {
  const { data } = await apiClient.get(`${rolePath()}/me`);
  return meSchema.parse(data);
}

export async function changePassword(body: { current_password: string; new_password: string }): Promise<void> {
  await apiClient.post('/tenant/change-password', body);
}
