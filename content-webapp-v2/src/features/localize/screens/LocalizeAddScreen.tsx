import { Alert, Button, Chip, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { LoadError } from '@shared/components/LoadError';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import type { Website } from '../types/localize.types';

const statusValues = ['Active', 'Inactive'];

type SiteDraft = Pick<Website, 'id' | 'name' | 'domain' | 'status' | 'languages'>;

const NEW_SITE: SiteDraft = { id: '', name: '', domain: '', status: 'Active', languages: [] };

function toDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').split('/')[0];
}

function SiteForm({ site }: { site: SiteDraft }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { languages, create, creating, update, updating } = useLocalizeSites();
  const edit = site.id !== '';

  const form = useForm({
    initialValues: {
      name: site.name,
      domain: site.domain,
      status: site.status || NEW_SITE.status,
      codes: site.languages.filter((l) => l.enabled).map((l) => l.code),
    },
    validate: { domain: (value) => (toDomain(value) === '' ? t('localize.incomplete') : null) },
  });

  const handleSave = form.onSubmit(({ name, domain, status, codes }) => {
    const fields = {
      domain: toDomain(domain),
      name: name.trim(),
      status,
      languages: codes.map((code) => ({ code, enabled: true })),
    };
    const onSuccess = () => void navigate({ to: routePaths.localize });
    if (edit) update({ id: site.id, fields }, { onSuccess });
    else create(fields, { onSuccess });
  });

  return (
    <form onSubmit={handleSave}>
      <Stack gap="md" maw={640}>
        <Title order={2}>{t(edit ? 'localize.editTitle' : 'localize.addTitle')}</Title>
        <Text c="dimmed">{t('localize.addDescription')}</Text>
        <TextInput label={t('localize.name')} {...form.getInputProps('name')} />
        <TextInput
          label={t('localize.domain')}
          placeholder={t('localize.domainPlaceholder')}
          {...form.getInputProps('domain')}
        />
        <Select
          label={t('localize.status')}
          data={statusValues.map((v) => ({ value: v, label: t(`localize.statusOptions.${v}`) }))}
          allowDeselect={false}
          {...form.getInputProps('status')}
        />
        <Text fw={700}>{t('localize.languages')}</Text>
        <Group gap="xs">
          <Chip.Group multiple {...form.getInputProps('codes')}>
            {languages.map((lang) => (
              <Chip key={lang.code} value={lang.code}>
                {lang.name}
              </Chip>
            ))}
          </Chip.Group>
        </Group>
        <Group gap="md">
          <Button type="submit" loading={creating || updating}>
            {t(edit ? 'localize.update' : 'localize.submit')}
          </Button>
          <Button variant="subtle" onClick={() => void navigate({ to: routePaths.localize })}>
            {t('localize.backSites')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function LocalizeAddScreen() {
  const { t } = useTranslation();
  const { siteId } = useParams({ strict: false });
  const { sites, isLoading, error } = useLocalizeSites();
  const site = sites.find((s) => s.id === siteId);

  if (!siteId) return <SiteForm key="new" site={NEW_SITE} />;
  if (isLoading) return <Text c="dimmed">{t('common.loading')}</Text>;
  if (error) return <LoadError error={error} />;
  if (!site) return <Alert>{t('localize.notFound')}</Alert>;
  return <SiteForm key={siteId} site={site} />;
}
