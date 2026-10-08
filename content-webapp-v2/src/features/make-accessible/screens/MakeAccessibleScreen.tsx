import { Alert, Anchor, Button, Card, Center, Group, List, Paper, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RemediationSteps } from '../components/RemediationSteps';
import { useRemediationUpload } from '../hooks/useRemediationUpload';
import { selectValue } from '@shared/utils/select';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { notifyApiError } from '@shared/utils/notifyApiError';
import classes from './MakeAccessibleScreen.module.css';

const sampleKeys = ['diagrams', 'tables', 'scan', 'stem'] as const;
const supportedKeys = ['supportedPdf', 'supportedScan', 'supportedDocx'] as const;

const accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function MakeAccessibleScreen() {
  const { t } = useTranslation();
  const { languageOptions, languagesError, upload, isUploading } = useRemediationUpload();
  const [files, setFiles] = useState<File[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [category, setCategory] = useState('all');
  const [showSamples, { toggle: toggleSamples }] = useDisclosure(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | undefined) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)].slice(0, 5));
  };

  const handleUpload = async () => {
    let succeeded = 0;
    let firstError: unknown;
    for (const file of files) {
      try {
        await upload({ file, targetLanguage });
        succeeded += 1;
      } catch (err) {
        if (firstError === undefined) firstError = err;
      }
    }
    notifications.show({ message: `uploaded ${succeeded}/${files.length}` });
    if (firstError !== undefined) {
      notifyApiError(firstError);
      return;
    }
    setFiles([]);
  };
  const languagesErrorMessage = toApiErrorMessage(languagesError);

  return (
    <Stack gap="md">
      <Text variant="eyebrow">{t('makeAccessible.eyebrow')}</Text>
      <Title order={2}>{t('makeAccessible.title')}</Title>
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
        <Button variant="outline" size="md">
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
        <Button disabled={files.length === 0} loading={isUploading} onClick={() => void handleUpload()}>
          {isUploading ? t('makeAccessible.uploading') : t('makeAccessible.upload')}
        </Button>
      </Group>
      {languagesErrorMessage && <Alert>{languagesErrorMessage}</Alert>}

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
        <Anchor component="button" type="button" size="sm" fw={700} onClick={toggleSamples}>
          {showSamples ? t('makeAccessible.hideSamples') : t('makeAccessible.showSamples')}
        </Anchor>
      </Group>

      {showSamples && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {sampleKeys
            .filter((key) => category === 'all' || category === key)
            .map((key) => (
              <Card key={key} p={0} radius="md">
                <Card.Section>
                  <Center h={72} c="dimmed" fz="sm" className={classes.samplePreview}>
                    {t(`makeAccessible.samples.${key}.preview`)}
                  </Center>
                </Card.Section>
                <Stack gap={4} p="md">
                  <Text fw={700}>{t(`makeAccessible.samples.${key}.title`)}</Text>
                  <Text size="sm" c="dimmed">
                    {t(`makeAccessible.samples.${key}.subtitle`)}
                  </Text>
                </Stack>
              </Card>
            ))}
        </SimpleGrid>
      )}

      <Text size="sm" c="dimmed">
        {t('makeAccessible.afterUpload')}
      </Text>
    </Stack>
  );
}
