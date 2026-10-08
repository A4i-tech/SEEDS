import { Alert, Button, Modal, Stack } from '@mantine/core';
import type { FormEventHandler, ReactNode } from 'react';
import { toApiErrorMessage } from '@shared/utils/apiErrors';

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
  const error = toApiErrorMessage(mutation.error);

  return (
    <Modal opened onClose={onClose} title={title} centered>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {children}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={mutation.isPending} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
