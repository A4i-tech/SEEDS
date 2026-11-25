import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiState } from '@shared/utils/apiState';
import { getVolunteers } from '../api/volunteers';
import { registrationKeys } from '../types/registration.types';

export function useVolunteers(enabled = true) {
  const status = useAuthStore((s) => s.status);
  const query = useQuery({
    queryKey: registrationKeys.volunteers,
    queryFn: getVolunteers,
    enabled: enabled && status === 'authenticated',
  });
  const state = toApiState(query);
  return { state, volunteers: state.status === 'done' ? state.data : [], reload: () => void query.refetch() };
}
