import { Button, Chip, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { selectValue } from '@shared/utils/select';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import type { Website } from '../types/localize.types';
import classes from './LocalizeAddScreen.module.css';

const statusValues = ['Active', 'Inactive'];

type SiteDraft = Pick<Website, 'id' | 'name' | 'domain' | 'status' | 'languages'>;

const NEW_SITE: SiteDraft = { id: '', name: '', domain: '', status: 'Active', languages: [] };

const MODE_CONFIG = {
  create: { title: 'localize.addTitle', submit: 'localize.submit' },
  edit: { title: 'localize.editTitle', submit: 'localize.update' },
};

function toDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').split('/')[0];
}

function SiteForm({ mode, site }: { mode: keyof typeof MODE_CONFIG; site: SiteDraft }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { languages, create, creating, update, updating } = useLocalizeSites();
  const config = MODE_CONFIG[mode];

  const [name, setName] = useState(site.name);
  const [domain, setDomain] = useState(site.domain);
  const [status, setStatus] = useState(site.status || NEW_SITE.status);
  const [codes, setCodes] = useState<string[]>(() =>
    site.languages.filter((l) => l.enabled).map((l) => l.code),
  );
  const [error, setError] = useState('');

  const saving = creating || updating;

  const handleSave = async () => {
    setError('');
    const cleanDomain = toDomain(domain);
    if (cleanDomain === '') {
      setError(t('localize.incomplete'));
      return;
    }
    try {
      const fields = {
        domain: cleanDomain,
        name: name.trim(),
        status,
        languages: codes.map((code) => ({ code, enabled: true })),
      };
      if (mode === 'edit') {
        await update({ id: site.id, fields });
      } else {
        await create(fields);
      }
      void navigate({ to: routePaths.localize });
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack gap="md" className={classes.form}>
      <Title order={2}>{t(config.title)}</Title>
      <Text c="dimmed">{t('localize.addDescription')}</Text>
      <TextInput
        label={t('localize.name')}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <TextInput
        label={t('localize.domain')}
        placeholder={t('localize.domainPlaceholder')}
        value={domain}
        onChange={(e) => setDomain(e.currentTarget.value)}
      />
      <Select
        label={t('localize.status')}
        value={status}
        onChange={(v) => setStatus(selectValue(v, 'Active'))}
        data={statusValues.map((v) => ({ value: v, label: t(`localize.statusOptions.${v}`) }))}
      />
      <Text fw={700}>{t('localize.languages')}</Text>
      <Group gap="xs">
        <Chip.Group multiple value={codes} onChange={setCodes}>
          {languages.map((lang) => (
            <Chip key={lang.code} value={lang.code}>
              {lang.name}
            </Chip>
          ))}
        </Chip.Group>
      </Group>
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      <Group gap="md">
        <Button className={classes.submitButton} loading={saving} onClick={() => void handleSave()}>
          {t(config.submit)}
        </Button>
        <Button variant="subtle" onClick={() => void navigate({ to: routePaths.localize })}>
          {t('localize.backSites')}
        </Button>
      </Group>
    </Stack>
  );
}

export function LocalizeAddScreen() {
  const { t } = useTranslation();
  const { siteId } = useParams({ strict: false });
  const { sites, isLoading } = useLocalizeSites();
  const site = sites.find((s) => s.id === siteId);

  if (!siteId) return <SiteForm key="new" mode="create" site={NEW_SITE} />;
  if (isLoading) return <Text c="dimmed">{t('common.loading')}</Text>;
  if (!site) {
    return (
      <Text c="red" role="alert">
        {t('localize.notFound')}
      </Text>
    );
  }
  return <SiteForm key={siteId} mode="edit" site={site} />;
}
