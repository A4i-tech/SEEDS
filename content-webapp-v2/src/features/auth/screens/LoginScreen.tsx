import { Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useLogin } from '../hooks/useLogin';
import classes from './LoginScreen.module.css';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutateAsync: login, isPending } = useLogin();
  const [error, setError] = useState('');

  const form = useForm<LoginValues>({
    initialValues: { identifier: '', password: '' },
    validate: zodResolver(loginSchema),
  });

  const handleSubmit = async (values: LoginValues) => {
    setError('');
    try {
      await login(values);
      await navigate({ to: routePaths.home, replace: true });
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack align="center" justify="center" mih="100vh" px="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={420} maw="100%">
        <form onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
          <Stack gap="md">
            <Title order={2}>{t('login.title')}</Title>
            <TextInput
              label={t('login.identifier')}
              autoComplete="username"
              required
              {...form.getInputProps('identifier')}
            />
            <PasswordInput
              label={t('login.password')}
              autoComplete="current-password"
              required
              {...form.getInputProps('password')}
            />
            {error && (
              <Text c="red" role="alert">
                {error}
              </Text>
            )}
            <Button type="submit" fullWidth className={classes.submitButton} loading={isPending}>
              {t('login.submit')}
            </Button>
            <Text size="sm">
              <Link to={routePaths.register}>{t('login.signup')}</Link>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
