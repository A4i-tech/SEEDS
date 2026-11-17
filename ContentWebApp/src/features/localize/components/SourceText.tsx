import { Anchor } from '@mantine/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { truncateMiddle } from '../utils/truncateMiddle';
import classes from './SourceText.module.css';

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
    <div className={classes.cell}>
      {expanded ? (
        <span className={classes.full}>{text}</span>
      ) : (
        <span ref={ref} className={classes.line} title={text}>
          {display}
        </span>
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
    </div>
  );
}
