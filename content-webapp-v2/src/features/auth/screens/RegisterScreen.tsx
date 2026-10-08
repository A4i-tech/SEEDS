import { Alert, Anchor, Button, List, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useMutation } from '@tanstack/react-query';
import { useLinkProps, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { registerTenant } from '../api/register';

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
  const { redirect } = useSearch({ from: '/register' });
  const loginLink = useLinkProps({ to: routePaths.login, search: { redirect } });
  const { mutate: register, isPending, error } = useMutation({
    mutationFn: registerTenant,
    onSuccess: () => navigate({ to: routePaths.login, search: { redirect } }),
  });
  const errorMessage = toApiErrorMessage(error);

  const form = useForm<RegisterValues>({
    initialValues: { tenantName: '', email: '', password: '', confirmPassword: '' },
    validate: zodResolver(registerSchema),
  });

  const checks = passwordChecks(form.values.password);

  return (
    <Stack align="center" justify="center" mih="100vh" px="md">
      <Paper shadow="sm" p="xl" radius="md" w={420} maw="100%">
        <form onSubmit={form.onSubmit((values) =>
            register({ email: values.email, password: values.password, tenant_name: values.tenantName }),
          )}>
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
            {errorMessage && <Alert>{errorMessage}</Alert>}
            <Button type="submit" fullWidth loading={isPending}>
              {t('register.submit')}
            </Button>
            <Anchor {...loginLink} size="sm">
              {t('register.haveAccount')}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
