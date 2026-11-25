import { Anchor, Group, Modal } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ExpandedModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened fullScreen onClose={onClose} title={title}>
      <Group gap={4} wrap="nowrap" mb="md">
        <ArrowLeft size={16} aria-hidden />
        <Anchor component="button" type="button" size="sm" variant="rowAction" onClick={onClose}>
          {t('analytics.expanded.back')}
        </Anchor>
      </Group>
      {children}
    </Modal>
  );
}
