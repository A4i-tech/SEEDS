import { Button, List, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
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

function passwordValid(password: string) {
  return Object.values(passwordChecks(password)).every(Boolean);
}

const registerSchema = z
  .object({
    tenantName: z.string().min(1, 'Required'),
    email: z.string().min(1, 'Required').email('Invalid email'),
    password: z.string().min(1, 'Required'),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => passwordValid(v.password), { message: 'Password policy', path: ['password'] });

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RegisterValues>({
    initialValues: { tenantName: '', email: '', password: '', confirmPassword: '' },
    validate: zodResolver(registerSchema),
  });

  const checks = passwordChecks(form.values.password);

  const handleSubmit = async (values: RegisterValues) => {
    setError(null);
    setSubmitting(true);
    try {
      await registerTenant({ email: values.email, password: values.password, tenant_name: values.tenantName });
      await navigate(routePaths.login);
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
              <List.Item>
                <Text c={checks.length ? 'green' : 'dimmed'}>{t('register.policyLength')}</Text>
              </List.Item>
              <List.Item>
                <Text c={checks.lower && checks.upper ? 'green' : 'dimmed'}>{t('register.policyCase')}</Text>
              </List.Item>
              <List.Item>
                <Text c={checks.number && checks.symbol ? 'green' : 'dimmed'}>{t('register.policyNumberSymbol')}</Text>
              </List.Item>
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
