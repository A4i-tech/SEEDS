import { PasswordInput, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { zodValidate } from '@shared/utils/schema';
import { registerVolunteer } from '../api/volunteers';
import { useRegistrationRefresh } from '../hooks/useRegistrationRefresh';
import { volunteerRegisterSchema, type VolunteerRegister } from '../types/registration.types';
import { FormModal } from './FormModal';

export function VolunteerFormModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { saved } = useRegistrationRefresh();
  const register = useMutation({ mutationFn: registerVolunteer, onSuccess: saved });
  const form = useForm<VolunteerRegister>({
    initialValues: { name: '', email: '', password: '' },
    validate: zodValidate(volunteerRegisterSchema),
  });

  return (
    <FormModal
      title={t('registration.addVolunteer')}
      submitLabel={t('registration.save')}
      errorMessage={register.error && register.error.message}
      isPending={register.isPending}
      onClose={onClose}
      onSubmit={form.onSubmit((values) => register.mutate(values, { onSuccess: onClose }))}
    >
      <TextInput label={t('registration.name')} required {...form.getInputProps('name')} />
      <TextInput label={t('registration.email')} type="email" required {...form.getInputProps('email')} />
      <PasswordInput label={t('registration.password')} required {...form.getInputProps('password')} />
    </FormModal>
  );
}
