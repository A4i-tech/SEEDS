import { Anchor, Box, Text } from '@mantine/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { truncateMiddle } from '../utils/truncateMiddle';

export function SourceText({ text }: { text: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(text);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => setDisplay(truncateMiddle(text, element.clientWidth, getComputedStyle(element).font));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <Box w="clamp(10rem, 25vw, 16rem)">
      {expanded ? (
        <Text component="span" display="block" style={{ overflowWrap: 'anywhere' }}>
          {text}
        </Text>
      ) : (
        <Text component="span" display="block" truncate ref={ref} title={text}>
          {display}
        </Text>
      )}
      {display !== text && (
        <Anchor
          component="button"
          type="button"
          size="xs"
          aria-expanded={expanded}
          aria-label={expanded ? t('localize.showLessSource') : t('localize.showFullSource')}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('localize.showLess') : t('localize.showMore')}
        </Anchor>
      )}
    </Box>
  );
}
