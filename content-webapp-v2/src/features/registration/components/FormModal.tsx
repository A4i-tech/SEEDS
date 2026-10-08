import { Alert, Button, Modal, Stack } from '@mantine/core';
import type { FormEventHandler, ReactNode } from 'react';

export function FormModal({
  title,
  submitLabel,
  submitDisabled,
  mutation,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  submitLabel: string;
  submitDisabled?: boolean;
  mutation: { error: Error | null; isPending: boolean };
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {


  return (
    <Modal opened onClose={onClose} title={title} centered>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {children}
          {mutation.error && <Alert>{mutation.error.message}</Alert>}
          <Button type="submit" loading={mutation.isPending} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
