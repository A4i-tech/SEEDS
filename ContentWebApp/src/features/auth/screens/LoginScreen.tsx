import { Alert, Anchor, Button, Paper, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodValidate } from '@shared/utils/schema';
import { useLinkProps, useRouter, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useLogin } from '../hooks/useLogin';
import { PageTitle } from '@shared/components/PageTitle';

const loginSchema = z.object({
  identifier: z.string().min(1, 'validation.required'),
  password: z.string().min(1, 'validation.required'),
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
    validate: zodValidate(loginSchema),
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
            <PageTitle title={t('login.title')} />
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
