import { Alert, Button, Group, Paper, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RemediationSteps } from '../components/RemediationSteps';
import { useRemediationUpload } from '../hooks/useRemediationUpload';
import { selectValue } from '@shared/utils/select';
import { notifyApiError } from '@shared/utils/notifyApiError';
import classes from './MakeAccessibleScreen.module.css';
import { PageTitle } from '@shared/components/PageTitle';

const supportedKeys = ['supportedPdf', 'supportedScan', 'supportedDocx'] as const;

const accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function MakeAccessibleScreen() {
  const { t } = useTranslation();
  const { languageOptions, languagesError, upload, isUploading } = useRemediationUpload();
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectFile = (incoming: FileList) => {
    setFile(incoming[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      await upload({ file, targetLanguage });
    } catch (err) {
      notifyApiError(err as Error);
      return;
    }
    notifications.show({ message: t('makeAccessible.uploaded', { name: file.name }) });
    setFile(null);
  };


  return (
    <Stack gap="md">
      <Text variant="eyebrow">{t('makeAccessible.eyebrow')}</Text>
      <PageTitle title={t('makeAccessible.title')} />
      <Text c="dimmed">{t('makeAccessible.description')}</Text>
      <RemediationSteps activeStep={0} />

      <div
        role="button"
        tabIndex={0}
        aria-label={t('makeAccessible.dropzone')}
        className={dragging ? `${classes.dropzone} ${classes.dragging}` : classes.dropzone}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          selectFile(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <Upload size={32} aria-hidden />
        <Text variant="rowTitle">{t('makeAccessible.dropzone')}</Text>
        <Text size="sm" c="dimmed">
          {t('makeAccessible.dropzoneHint')}
        </Text>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          aria-hidden
          onChange={(e) => {
            if (e.target.files) selectFile(e.target.files);
            e.target.value = '';
          }}
        />
        <Button variant="outline" size="md">
          {t('makeAccessible.browse')}
        </Button>
      </div>

      {file && <Text size="sm">{file.name}</Text>}

      <Group gap="md" align="flex-end">
        <Select
          aria-label={t('makeAccessible.targetLanguage')}
          placeholder={t('makeAccessible.noTranslation')}
          value={targetLanguage}
          onChange={(v) => setTargetLanguage(selectValue(v))}
          data={[{ value: '', label: t('makeAccessible.noTranslation') }, ...languageOptions]}
        />
        <Button disabled={!file} loading={isUploading} onClick={() => void handleUpload()}>
          {isUploading ? t('makeAccessible.uploading') : t('makeAccessible.upload')}
        </Button>
      </Group>
      {languagesError && <Alert>{languagesError}</Alert>}

      <Stack gap="xs">
        <Text variant="eyebrow" size="sm">{t('makeAccessible.supported')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {supportedKeys.map((key) => (
            <Paper key={key} p="sm" radius="sm" ta="center">
              <Text size="sm">{t(`makeAccessible.${key}`)}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>

      <Text size="sm" c="dimmed">
        {t('makeAccessible.afterUpload')}
      </Text>
    </Stack>
  );
}
