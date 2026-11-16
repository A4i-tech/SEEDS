import { Alert, Anchor, Button, Chip, Group, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LoadError } from '@shared/components/LoadError';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import type { Website } from '../types/localize.types';
import { PageTitle } from '@shared/components/PageTitle';
import { BackLink } from '@shared/components/BackLink';
import { commonFirst } from '../utils/languages';

const statusValues = ['Active', 'Inactive'];

type SiteDraft = Pick<Website, 'id' | 'name' | 'domain' | 'status' | 'languages'>;

const NEW_SITE: SiteDraft = { id: '', name: '', domain: '', status: 'Active', languages: [] };

function toDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').split('/')[0];
}

function SiteForm({ site }: { site: SiteDraft }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { languages, languageName, create, creating, update, updating } = useLocalizeSites();
  const edit = site.id !== '';
  const [search, setSearch] = useState('');

  const form = useForm({
    initialValues: {
      name: site.name,
      domain: site.domain,
      status: site.status || NEW_SITE.status,
      codes: site.languages.map((l) => l.code),
      disabled: site.languages.filter((l) => !l.enabled).map((l) => l.code),
    },
    validate: { domain: (value) => (toDomain(value) === '' ? t('localize.incomplete') : null) },
  });

  const handleSave = form.onSubmit(({ name, domain, status, codes, disabled }) => {
    const fields = {
      domain: toDomain(domain),
      name: name.trim(),
      status,
      languages: codes.map((code) => ({ code, enabled: !disabled.includes(code) })),
    };
    const onSuccess = () => void navigate({ to: '/localize' });
    if (edit) update({ id: site.id, fields }, { onSuccess });
    else create(fields, { onSuccess });
  });

  return (
    <form onSubmit={handleSave}>
      <Stack gap="md" maw={640}>
        <BackLink to="/localize" label={t('nav.localize')} />
        <PageTitle title={t(edit ? 'localize.editTitle' : 'localize.addTitle')} />
        <Text c="dimmed">{t('localize.addDescription')}</Text>
        <TextInput label={t('localize.name')} {...form.getInputProps('name')} />
        <TextInput
          label={t('localize.domain')}
          placeholder={t('localize.domainPlaceholder')}
          {...form.getInputProps('domain')}
        />
        <Select
          label={t('localize.siteStatus')}
          description={t('localize.siteStatusHint')}
          data={statusValues.map((v) => ({ value: v, label: t(`localize.statusOptions.${v}`) }))}
          allowDeselect={false}
          {...form.getInputProps('status')}
        />
        <Text variant="label">{t('localize.languages')}</Text>
        <TextInput
          aria-label={t('localize.searchLanguages')}
          placeholder={t('localize.searchLanguages')}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Group gap="md">
          <Text size="sm">{t('localize.selected', { count: form.values.codes.length })}</Text>
          <Anchor component="button" type="button" size="sm" onClick={() => form.setFieldValue('codes', [])}>
            {t('localize.clearAll')}
          </Anchor>
        </Group>
        <Group gap="xs">
          <Chip.Group multiple {...form.getInputProps('codes')}>
            {commonFirst(languages)
              .filter((lang) => lang.name.toLowerCase().includes(search.trim().toLowerCase()))
              .map((lang) => (
                <Chip key={lang.code} value={lang.code}>
                  {lang.name}
                </Chip>
              ))}
          </Chip.Group>
        </Group>
        {form.values.codes.map((code) => (
          <Switch
            key={code}
            label={`${languageName(code)} · ${t('localize.languageEnabledLabel')}`}
            description={t('localize.languageEnabledHint')}
            checked={!form.values.disabled.includes(code)}
            onChange={(e) =>
              form.setFieldValue(
                'disabled',
                e.currentTarget.checked
                  ? form.values.disabled.filter((c) => c !== code)
                  : [...form.values.disabled, code],
              )
            }
          />
        ))}
        <Group gap="md">
          <Button type="submit" loading={creating || updating}>
            {edit ? t('localize.update') : t('localize.submitCount', { count: form.values.codes.length })}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function LocalizeAddScreen() {
  const { t } = useTranslation();
  const { siteId } = useParams({ strict: false });
  const { state, sites } = useLocalizeSites();
  const site = sites.find((s) => s.id === siteId);

  if (!siteId) return <SiteForm key="new" site={NEW_SITE} />;
  if (state.status === 'loading') return <Text c="dimmed">{t('common.loading')}</Text>;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (!site) return <Alert>{t('localize.notFound')}</Alert>;
  return <SiteForm key={siteId} site={site} />;
}
