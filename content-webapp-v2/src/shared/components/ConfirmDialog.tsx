import { Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import classes from './ConfirmDialog.module.css';

interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

export function openConfirmDialog({ title, body, confirmLabel, cancelLabel, onConfirm }: ConfirmOptions) {
  modals.openConfirmModal({
    centered: true,
    size: 480,
    radius: 'lg',
    title: <Title order={3}>{title}</Title>,
    children: <Text size="sm">{body}</Text>,
    labels: { confirm: confirmLabel, cancel: cancelLabel },
    confirmProps: { className: classes.destructiveButton },
    onConfirm,
  });
}
