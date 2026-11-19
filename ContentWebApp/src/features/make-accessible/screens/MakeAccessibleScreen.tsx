import { Alert, Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CircleAlert, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RemediationSteps } from '../components/RemediationSteps';
import { useRemediationUpload } from '../hooks/useRemediationUpload';
import { defaultBookTitle } from '../utils/bookTitle';
import { useRole } from '@features/auth/store/useAuthStore';
import { BookOrganiser, sortByName, type OrganiserItem } from '@shared/components/BookOrganiser';
import { PageTitle } from '@shared/components/PageTitle';
import { volunteerRole } from '@shared/utils/jwt';
import { selectValue } from '@shared/utils/select';
import { MAX_BOOK_FILES, MAX_PDF_MB, toMb } from '@shared/utils/upload';
import classes from './MakeAccessibleScreen.module.css';

const supportedKeys = ['supportedPdf', 'supportedScan'] as const;

const accept = '.pdf,application/pdf';

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const isTooBig = (file: File) => toMb(file.size) > MAX_PDF_MB;

export function MakeAccessibleScreen() {
  const { t } = useTranslation();
  if (useRole() === volunteerRole) {
    return (
      <Stack gap="md">
        <PageTitle title={t('makeAccessible.title')} />
        <Text>{t('makeAccessible.volunteerNote')}</Text>
      </Stack>
    );
  }
  return <UploadForm />;
}

function UploadForm() {
  const { t } = useTranslation();
  const { languageOptions, languagesError, upload, isUploading, uploadBook, isUploadingBook, bookError, resetBookError } = useRemediationUpload();
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<OrganiserItem[]>([]);
  const [filesById, setFilesById] = useState<Record<string, File>>({});
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const browseRef = useRef<HTMLButtonElement>(null);

  const isBook = items.length >= 2;
  const bookFiles = items.map((item) => filesById[item.id]);
  const titleBlank = title.trim() === '';

  const clearBook = () => {
    setItems([]);
    setFilesById({});
    setTitle('');
    setTitleTouched(false);
  };

  const selectSingle = (picked: File) => {
    clearBook();
    setFile(picked);
  };

  const selectFiles = (incoming: FileList) => {
    const picked = Array.from(incoming);
    setSelectionError('');
    resetBookError();
    if (picked.length === 1) {
      selectSingle(picked[0]);
      return;
    }
    const pdfs = picked.filter(isPdf);
    const skipped = picked.filter((f) => !isPdf(f));
    if (skipped.length > 0) {
      notifications.show({ message: t('makeAccessible.skippedNonPdf', { names: skipped.map((f) => f.name).join(', ') }) });
    }
    if (pdfs.length > MAX_BOOK_FILES) {
      setSelectionError(t('makeAccessible.tooManyFiles', { limit: MAX_BOOK_FILES, count: pdfs.length }));
      return;
    }
    if (pdfs.length === 0) return;
    if (pdfs.length === 1) {
      selectSingle(pdfs[0]);
      return;
    }
    const entries = pdfs.map((pdf, index) => ({
      item: { id: `${pdf.name}-${pdf.size}-${pdf.lastModified}-${index}`, name: pdf.name, sizeMb: toMb(pdf.size) },
      pdf,
    }));
    const sorted = sortByName(entries.map((entry) => entry.item));
    setFile(null);
    setItems(sorted);
    setFilesById(Object.fromEntries(entries.map((entry) => [entry.item.id, entry.pdf])));
    setTitle(defaultBookTitle(sorted[0].name));
    setTitleTouched(false);
  };

  const changeItems = (next: OrganiserItem[]) => {
    resetBookError();
    if (next.length === 1) {
      selectSingle(filesById[next[0].id]);
      browseRef.current?.focus();
      return;
    }
    setItems(next);
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      await upload({ file, targetLanguage });
    } catch {
      return;
    }
    setFile(null);
  };

  const handleUploadBook = () => {
    setTitleTouched(true);
    if (titleBlank) return;
    const count = items.length;
    uploadBook(
      { files: bookFiles, title: title.trim(), targetLanguage },
      {
        onSuccess: () => {
          clearBook();
          notifications.show({ message: t('makeAccessible.bookQueued', { count }) });
        },
      },
    );
  };

  const tooBig = isBook ? bookFiles.some(isTooBig) : file !== null && isTooBig(file);

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
          selectFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <Upload size={32} aria-hidden />
        <Text variant="rowTitle">{t('makeAccessible.dropzone')}</Text>
        <Text size="sm" c="dimmed">
          {t('makeAccessible.dropzoneHint', { limit: MAX_PDF_MB })}
        </Text>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          aria-hidden
          onChange={(e) => {
            if (e.target.files) selectFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button ref={browseRef} variant="outline" size="md">
          {t('makeAccessible.browse')}
        </Button>
      </div>

      {selectionError && <Alert color="red" role="alert">{selectionError}</Alert>}

      {file && (
        <Stack gap={4}>
          <Text size="sm">{t('makeAccessible.selectedFile', { name: file.name })}</Text>
          {isTooBig(file) && (
            <Text size="sm" className={classes.problem}>
              <CircleAlert size={16} aria-hidden />
              {t('bookOrganiser.tooBig', { name: file.name, size: toMb(file.size).toFixed(1), limit: MAX_PDF_MB })}
            </Text>
          )}
        </Stack>
      )}

      {isBook && (
        <>
          <BookOrganiser items={items} onChange={changeItems} allowRemove />
          <TextInput
            label={t('makeAccessible.bookName')}
            required
            value={title}
            error={titleTouched && titleBlank ? t('makeAccessible.bookNameRequired') : undefined}
            onChange={(e) => setTitle(e.currentTarget.value)}
            onBlur={() => setTitleTouched(true)}
          />
          {bookError && (
            <Alert color="red" role="alert">
              {bookError} {t('makeAccessible.bookFailed')}
            </Alert>
          )}
        </>
      )}

      <Group gap="md" align="flex-end">
        <Select
          aria-label={t('makeAccessible.targetLanguage')}
          placeholder={t('makeAccessible.noTranslation')}
          value={targetLanguage}
          onChange={(v) => setTargetLanguage(selectValue(v))}
          data={[{ value: '', label: t('makeAccessible.noTranslation') }, ...languageOptions]}
        />
        {isBook ? (
          <Button
            disabled={tooBig || titleBlank}
            loading={isUploadingBook}
            onClick={() => void handleUploadBook()}
          >
            {isUploadingBook ? t('makeAccessible.uploadingBook') : t('makeAccessible.uploadBook', { count: items.length })}
          </Button>
        ) : (
          <Button disabled={!file || tooBig} loading={isUploading} onClick={() => void handleUpload()}>
            {isUploading ? t('makeAccessible.uploading') : t('makeAccessible.upload')}
          </Button>
        )}
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
