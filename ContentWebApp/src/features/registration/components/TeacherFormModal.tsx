import { PasswordInput, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { FormModal } from './FormModal';
import { useTeachers } from '../hooks/useTeachers';
import {
  teacherRegisterSchema,
  teacherUpdateSchema,
  type SchoolTeacher,
} from '../types/registration.types';

export type TeacherFormValues = {
  name: string;
  phone_number: string;
  password: string;
  role: string;
};

export const EMPTY_VALUES: TeacherFormValues = { name: '', phone_number: '', password: '', role: 'teacher' };

export const MODE_CONFIG = {
  create: {
    title: 'registration.addTeacher',
    passwordLabel: 'registration.password',
    passwordRequired: true,
    showRole: true,
    schema: teacherRegisterSchema,
  },
  edit: {
    title: 'registration.editTeacher',
    passwordLabel: 'registration.newPassword',
    passwordRequired: false,
    showRole: false,
    schema: teacherUpdateSchema,
  },
};

export function TeacherFormModal({ teacher, onClose }: { teacher?: SchoolTeacher; onClose: () => void }) {
  const { t } = useTranslation();
  const { register, update } = useTeachers();
  const config = MODE_CONFIG[teacher ? 'edit' : 'create'];
  const form = useForm<TeacherFormValues>({
    initialValues: teacher
      ? { ...EMPTY_VALUES, name: teacher.name, phone_number: teacher.phone_number }
      : EMPTY_VALUES,
    validate: zodResolver(config.schema),
  });

  const handleSubmit = (values: TeacherFormValues) => {
    const options = { onSuccess: onClose };
    if (teacher) {
      update.mutate(
        {
          id: teacher.id,
          body: {
            name: values.name,
            phone_number: values.phone_number,
            ...(values.password && { password: values.password }),
          },
        },
        options,
      );
    } else {
      register.mutate(values, options);
    }
  };

  return (
    <FormModal
      title={t(config.title)}
      submitLabel={t('registration.save')}
      mutation={teacher ? update : register}
      onClose={onClose}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <TextInput label={t('registration.name')} required {...form.getInputProps('name')} />
      <TextInput label={t('registration.phone')} required {...form.getInputProps('phone_number')} />
      <PasswordInput
        label={t(config.passwordLabel)}
        required={config.passwordRequired}
        {...form.getInputProps('password')}
      />
      {config.showRole && (
        <Select
          label={t('registration.role')}
          data={[
            { value: 'teacher', label: t('registration.roles.teacher') },
            { value: 'content_creator', label: t('registration.roles.content_creator') },
          ]}
          {...form.getInputProps('role')}
        />
      )}
    </FormModal>
  );
}
