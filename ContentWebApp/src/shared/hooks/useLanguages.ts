import { useQuery } from '@tanstack/react-query';
import { getLanguages } from '@shared/services/languages';
import { toApiState } from '@shared/utils/apiState';

export function useLanguages(enabled = true) {
  const query = useQuery({
    queryKey: ['languages'],
    queryFn: getLanguages,
    enabled,
  });
  const state = toApiState(query);
  const languages = state.status === 'done' ? state.data : [];
  const options = languages.map((l) => ({ value: l.code, label: l.name }));
  return { state, languages, options };
}
