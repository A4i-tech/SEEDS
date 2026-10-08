import { Button, List, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { registerTenant } from '../api/register';
import classes from './LoginScreen.module.css';

function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

const registerSchema = z
  .object({
    tenantName: z.string().min(1, 'Required'),
    email: z.string().min(1, 'Required').email('Invalid email'),
    password: z.string().min(1, 'Required'),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => Object.values(passwordChecks(v.password)).every(Boolean), { message: 'Password policy', path: ['password'] });

type RegisterValues = z.infer<typeof registerSchema>;

function PolicyItem({ met, label }: { met: boolean; label: string }) {
  return (
    <List.Item>
      <Text c={met ? 'green' : 'dimmed'}>{label}</Text>
    </List.Item>
  );
}

export function RegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RegisterValues>({
    initialValues: { tenantName: '', email: '', password: '', confirmPassword: '' },
    validate: zodResolver(registerSchema),
  });

  const checks = passwordChecks(form.values.password);

  const handleSubmit = async (values: RegisterValues) => {
    setError('');
    setSubmitting(true);
    try {
      await registerTenant({ email: values.email, password: values.password, tenant_name: values.tenantName });
      await navigate({ to: routePaths.login });
    } catch (err) {
      setError(toApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack align="center" justify="center" mih="100vh" px="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={420} maw="100%">
        <form onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
          <Stack gap="md">
            <Title order={2}>{t('register.title')}</Title>
            <TextInput label={t('register.tenantName')} autoComplete="organization" required {...form.getInputProps('tenantName')} />
            <TextInput label={t('register.email')} autoComplete="email" required {...form.getInputProps('email')} />
            <PasswordInput label={t('register.password')} autoComplete="new-password" required {...form.getInputProps('password')} />
            <List size="sm" aria-label={t('register.policy')}>
              <PolicyItem met={checks.length} label={t('register.policyLength')} />
              <PolicyItem met={checks.lower && checks.upper} label={t('register.policyCase')} />
              <PolicyItem met={checks.number && checks.symbol} label={t('register.policyNumberSymbol')} />
            </List>
            <PasswordInput
              label={t('register.confirmPassword')}
              autoComplete="new-password"
              required
              {...form.getInputProps('confirmPassword')}
            />
            {error && (
              <Text c="red" role="alert">
                {error}
              </Text>
            )}
            <Button type="submit" fullWidth className={classes.submitButton} loading={submitting}>
              {t('register.submit')}
            </Button>
            <Text size="sm">
              <Link to={routePaths.login}>{t('register.haveAccount')}</Link>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
