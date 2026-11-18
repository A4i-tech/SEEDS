import { Textarea } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function RawBlock({ markdown, onChange }: { markdown: string; onChange: (markdown: string) => void }) {
  const { t } = useTranslation();
  return (
    <Textarea
      label={t('review.rawBlock')}
      autosize
      minRows={2}
      ff="monospace"
      defaultValue={markdown}
      onBlur={(e) => {
        if (e.currentTarget.value !== markdown) onChange(e.currentTarget.value);
      }}
    />
  );
}
