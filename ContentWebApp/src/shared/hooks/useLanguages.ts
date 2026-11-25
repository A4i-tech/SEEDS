import { useQuery } from '@tanstack/react-query';
import { getLanguages } from '@shared/services/languages';
import { toApiState } from '@shared/utils/apiState';

export function useLanguages() {
  const query = useQuery({
    queryKey: ['languages'],
    queryFn: getLanguages,
  });
  const state = toApiState(query);
  const languages = state.status === 'done' ? state.data : [];
  const options = languages.map((l) => ({ value: l.code, label: l.name }));
  return { state, languages, options };
}
