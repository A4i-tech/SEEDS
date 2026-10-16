import { Button, Code, CopyButton, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

function SnippetBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Code block>{code}</Code>
      <CopyButton value={code}>
        {({ copied, copy }) => (
          <Button variant="subtle" size="sm" onClick={copy}>
            {copied ? t('localize.copied') : t('localize.copy')}
          </Button>
        )}
      </CopyButton>
    </>
  );
}

export function SiteSnippetModal({
  title,
  sdkCode,
  devToolsCode,
  onClose,
}: {
  title: React.ReactNode;
  sdkCode: string;
  devToolsCode: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened onClose={onClose} title={title} centered>
      <Stack gap="md">
        <SnippetBlock code={sdkCode} />
        <Text fw={700}>{t('localize.devtools')}</Text>
        <Text size="sm" c="dimmed">
          {t('localize.devtoolsHint')}
        </Text>
        <SnippetBlock code={devToolsCode} />
      </Stack>
    </Modal>
  );
}
