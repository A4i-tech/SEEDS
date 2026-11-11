import { useLocalStorage } from '@mantine/hooks';
import { useEffect } from 'react';

export type TextSize = 'default' | 'large' | 'xlarge';

export function useDisplayPreferences() {
  const [textSize, setTextSize] = useLocalStorage<TextSize>({ key: 'seeds-text-size', defaultValue: 'default' });
  const [reduceMotion, setReduceMotion] = useLocalStorage({ key: 'seeds-reduce-motion', defaultValue: false });
  const [underlineLinks, setUnderlineLinks] = useLocalStorage({ key: 'seeds-underline-links', defaultValue: false });
  useEffect(() => {
    const { dataset } = document.documentElement;
    dataset.textSize = textSize;
    dataset.reduceMotion = String(reduceMotion);
    dataset.underlineLinks = String(underlineLinks);
  }, [textSize, reduceMotion, underlineLinks]);
  return { textSize, setTextSize, reduceMotion, setReduceMotion, underlineLinks, setUnderlineLinks };
}
