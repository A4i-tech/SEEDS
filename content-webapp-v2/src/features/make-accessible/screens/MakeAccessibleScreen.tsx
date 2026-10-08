import { Anchor, Button, Group, List, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RemediationSteps } from '../components/RemediationSteps';
import { useRemediationUpload } from '../hooks/useRemediationUpload';
import { selectValue } from '@shared/utils/select';
import classes from './MakeAccessibleScreen.module.css';

const sampleKeys = ['diagrams', 'tables', 'scan', 'stem'] as const;
const supportedKeys = ['supportedPdf', 'supportedScan', 'supportedDocx'] as const;

const accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function MakeAccessibleScreen() {
  const { t } = useTranslation();
  const { languageOptions, upload, isUploading } = useRemediationUpload();
  const [files, setFiles] = useState<File[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [category, setCategory] = useState('all');
  const [showSamples, setShowSamples] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | undefined) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)].slice(0, 5));
  };

  const handleUpload = async () => {
    for (const file of files) {
      await upload({ file, targetLanguage });
    }
    setFiles([]);
  };

  const dropzoneClass = (): string => {
    if (dragging) return `${classes.dropzone} ${classes.dragging}`;
    return classes.dropzone;
  };

  const uploadLabel = (): string => {
    if (isUploading) return t('makeAccessible.uploading');
    return t('makeAccessible.upload');
  };

  const samplesLabel = (): string => {
    if (showSamples) return t('makeAccessible.hideSamples');
    return t('makeAccessible.showSamples');
  };

  return (
    <Stack gap="md">
      <Text className={classes.eyebrow}>{t('makeAccessible.eyebrow')}</Text>
      <Title order={2}>{t('makeAccessible.title')}</Title>
      <Text c="dimmed">{t('makeAccessible.description')}</Text>
      <RemediationSteps activeStep={0} />

      <div
        role="button"
        tabIndex={0}
        aria-label={t('makeAccessible.dropzone')}
        className={dropzoneClass()}
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
        <Text size="lg">{t('makeAccessible.dropzone')}</Text>
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
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button variant="outline" size="md" className={classes.browseButton}>
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
          onChange={(v) => setTargetLanguage(selectValue(v))}
          data={[{ value: '', label: t('makeAccessible.noTranslation') }, ...languageOptions]}
        />
        <Button
          className={classes.submitButton}
          disabled={files.length === 0 || isUploading}
          onClick={() => void handleUpload()}
        >
          {uploadLabel()}
        </Button>
      </Group>

      <Stack gap="xs">
        <Text className={classes.label}>{t('makeAccessible.supported')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {supportedKeys.map((key) => (
            <div key={key} className={classes.tile}>
              {t(`makeAccessible.${key}`)}
            </div>
          ))}
        </SimpleGrid>
      </Stack>

      <Group justify="space-between" align="center">
        <Group gap="md">
          <Text fw={700}>{t('makeAccessible.trySample')}</Text>
          <Select
            aria-label={t('makeAccessible.trySample')}
            value={category}
            onChange={(v) => setCategory(selectValue(v, 'all'))}
            allowDeselect={false}
            data={[
              { value: 'all', label: t('makeAccessible.allCategories') },
              ...sampleKeys.map((key) => ({ value: key, label: t(`makeAccessible.samples.${key}.title`) })),
            ]}
          />
        </Group>
        <Anchor component="button" type="button" className={classes.link} onClick={() => setShowSamples((v) => !v)}>
          {samplesLabel()}
        </Anchor>
      </Group>

      {showSamples && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {sampleKeys
            .filter((key) => category === 'all' || category === key)
            .map((key) => (
              <div key={key} className={classes.sample}>
                <div className={classes.preview}>{t(`makeAccessible.samples.${key}.preview`)}</div>
                <Stack gap={4} className={classes.sampleBody}>
                  <Text fw={700}>{t(`makeAccessible.samples.${key}.title`)}</Text>
                  <Text size="sm" c="dimmed">
                    {t(`makeAccessible.samples.${key}.subtitle`)}
                  </Text>
                </Stack>
              </div>
            ))}
        </SimpleGrid>
      )}

      <Text size="sm" c="dimmed">
        {t('makeAccessible.afterUpload')}
      </Text>
    </Stack>
  );
}
