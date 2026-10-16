import { Alert, Button, Modal, Stack } from '@mantine/core';
import type { FormEventHandler, ReactNode } from 'react';

export function FormModal({
  title,
  submitLabel,
  submitDisabled,
  errorMessage,
  isPending,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  submitLabel: string;
  submitDisabled?: boolean;
  errorMessage: ReactNode;
  isPending: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <Modal opened onClose={onClose} title={title} centered>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {children}
          {errorMessage && <Alert>{errorMessage}</Alert>}
          <Button type="submit" loading={isPending} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
