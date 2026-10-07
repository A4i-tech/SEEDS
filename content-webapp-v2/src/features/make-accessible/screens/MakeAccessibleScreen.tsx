import { Button, Group, List, Select, Stack, Text, Title } from '@mantine/core';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRemediationUpload } from '../hooks/useRemediationUpload';
import classes from './MakeAccessibleScreen.module.css';

const accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function MakeAccessibleScreen() {
  const { t } = useTranslation();
  const { languages, upload, isUploading } = useRemediationUpload();
  const [files, setFiles] = useState<File[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)].slice(0, 5));
  };

  const handleUpload = async () => {
    for (const file of files) {
      await upload({ file, targetLanguage });
    }
    setFiles([]);
  };

  return (
    <Stack gap="md">
      <Text className={classes.eyebrow}>{t('makeAccessible.eyebrow')}</Text>
      <Title order={2}>{t('makeAccessible.title')}</Title>
      <Text c="dimmed">{t('makeAccessible.description')}</Text>

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
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <Upload size={32} aria-hidden />
        <Text fw={700}>{t('makeAccessible.dropzone')}</Text>
        <Text size="sm" c="dimmed">
          {t('makeAccessible.dropzoneHint')}
        </Text>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          aria-hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button variant="outline" className={classes.browseButton}>
          {t('makeAccessible.browse')}
        </Button>
      </div>

      {files.length > 0 && (
        <List>
          {files.map((file) => (
            <List.Item key={`${file.name}-${file.size}`}>{file.name}</List.Item>
          ))}
        </List>
      )}

      <Group gap="md" align="flex-end">
        <Select
          aria-label={t('makeAccessible.targetLanguage')}
          placeholder={t('makeAccessible.noTranslation')}
          value={targetLanguage}
          onChange={(v) => setTargetLanguage(v ?? '')}
          data={[{ value: '', label: t('makeAccessible.noTranslation') }, ...languages.map((l) => ({ value: l.code, label: l.name }))]}
        />
        <Button
          className={classes.submitButton}
          disabled={files.length === 0 || isUploading}
          onClick={() => void handleUpload()}
        >
          {isUploading ? t('makeAccessible.uploading') : t('makeAccessible.upload')}
        </Button>
      </Group>

      <Stack gap="xs">
        <Text fw={700}>{t('makeAccessible.supported')}</Text>
        <List>
          <List.Item>{t('makeAccessible.supportedPdf')}</List.Item>
          <List.Item>{t('makeAccessible.supportedScan')}</List.Item>
          <List.Item>{t('makeAccessible.supportedDocx')}</List.Item>
        </List>
      </Stack>
    </Stack>
  );
}
