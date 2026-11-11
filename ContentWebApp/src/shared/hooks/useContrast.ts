import { useLocalStorage } from '@mantine/hooks';
import { useEffect } from 'react';

export type Contrast = 'standard' | 'high';

export function useContrast() {
  const [contrast, setContrast] = useLocalStorage<Contrast>({ key: 'seeds-contrast', defaultValue: 'standard' });
  useEffect(() => {
    document.documentElement.dataset.contrast = contrast;
  }, [contrast]);
  return [contrast, setContrast] as const;
}
