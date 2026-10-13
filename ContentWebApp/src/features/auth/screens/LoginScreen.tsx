import { Alert, Anchor, Button, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useLinkProps, useRouter, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useLogin } from '../hooks/useLogin';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { redirect: returnTo } = useSearch({ from: '/' });
  const signupLink = useLinkProps({ to: '/register', search: { redirect: returnTo } });
  const { mutate: login, isPending, error } = useLogin();


  const form = useForm<LoginValues>({
    initialValues: { identifier: '', password: '' },
    validate: zodResolver(loginSchema),
  });

  return (
    <Stack align="center" justify="center" mih="100vh" px="md">
      <Paper shadow="sm" p="xl" radius="md" w={420} maw="100%">
        <form onSubmit={form.onSubmit((values) =>
            login(values, {
              onSuccess: () => router.history.replace(returnTo),
            }),
          )}>
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
            {error && <Alert>{error.message}</Alert>}
            <Button type="submit" fullWidth loading={isPending}>
              {t('login.submit')}
            </Button>
            <Anchor {...signupLink} size="sm">
              {t('login.signup')}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
