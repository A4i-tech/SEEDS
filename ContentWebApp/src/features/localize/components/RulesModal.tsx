import { Alert, Anchor, Button, Group, Modal, Select, Stack, Tabs, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { DataTable } from '@shared/components/DataTable';
import type { useLocalizeRules } from '../hooks/useLocalizeRules';
import { ruleKindSchema, type Rule, type RuleFields, type RuleKind } from '../types/localize.types';

interface RulesModalProps {
  rules: ReturnType<typeof useLocalizeRules>;
  languages: { value: string; label: string }[];
  onClose: () => void;
}

const EMPTY_RULE: RuleFields = { kind: 'exclusion', text: '', lang: '', translation: '' };

export function RulesModal({ rules, languages, onClose }: RulesModalProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const form = useForm<RuleFields>({ initialValues: EMPTY_RULE });
  const { kind, text, lang, translation } = form.values;
  const complete = text.trim() !== '' && (kind === 'exclusion' || (lang !== '' && translation !== ''));

  const reset = (nextKind: RuleKind) => {
    setEditingId('');
    form.setValues({ ...EMPTY_RULE, kind: nextKind });
    setPage(1);
  };

  const save = form.onSubmit((values) => {
    const fields = values.kind === 'exclusion' ? { ...values, lang: '', translation: '' } : values;
    if (editingId) rules.update({ id: editingId, fields });
    else rules.create(fields);
    reset(kind);
  });

  const confirmDelete = (rule: Rule) =>
    openConfirmDialog({
      title: t('localize.ruleDeleteTitle'),
      body: t('localize.ruleDeleteBody'),
      confirmLabel: t('localize.ruleDelete'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => rules.remove(rule.id),
    });

  const textColumn: DataTableColumn<Rule> = {
    key: 'text',
    header: kind === 'exclusion' ? t('localize.ruleText') : t('localize.ruleSourceText'),
    render: (row) => <Text ff="monospace">{row.text}</Text>,
  };
  const columns: DataTableColumn<Rule>[] =
    kind === 'exclusion'
      ? [textColumn]
      : [
          textColumn,
          { key: 'lang', header: t('localize.language'), render: (row) => row.lang },
          { key: 'translation', header: t('localize.ruleTranslation'), render: (row) => row.translation },
        ];

  return (
    <Modal opened onClose={onClose} title={t('localize.rulesTitle')} size="xl" centered>
      <Stack gap="md">
        <Text c="dimmed">{t('localize.rulesDescription')}</Text>
        <Tabs value={kind} onChange={(v) => reset(ruleKindSchema.parse(v))}>
          <Tabs.List>
            {ruleKindSchema.options.map((value) => (
              <Tabs.Tab key={value} value={value}>
                {t(`localize.ruleKinds.${value}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <form onSubmit={save}>
          <Stack gap="sm">
            <Textarea
              autosize
              minRows={1}
              label={kind === 'exclusion' ? t('localize.ruleText') : t('localize.ruleSourceText')}
              {...form.getInputProps('text')}
            />
            {kind === 'override' && (
              <>
                <Select
                  label={t('localize.language')}
                  placeholder={t('localize.pickLanguage')}
                  data={languages}
                  {...form.getInputProps('lang')}
                />
                <Textarea
                  autosize
                  minRows={2}
                  label={t('localize.ruleTranslation')}
                  {...form.getInputProps('translation')}
                />
              </>
            )}
            <Group gap="sm">
              <Button type="submit" disabled={!complete || rules.saving} loading={rules.saving}>
                {t('localize.ruleSave')}
              </Button>
              {editingId !== '' && (
                <Button variant="subtle" onClick={() => reset(kind)}>
                  {t('localize.ruleCancelEdit')}
                </Button>
              )}
            </Group>
          </Stack>
        </form>
        {rules.state.status === 'error' && <Alert>{rules.state.error.message}</Alert>}
        <DataTable<Rule>
          columns={columns}
          rows={rules.rules.filter((rule) => rule.kind === kind)}
          getRowId={(row) => row.id}
          loading={rules.state.status === 'loading'}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          emptyMessage={t('localize.rulesEmpty')}
          actions={(row) => (
            <Group gap="md" wrap="nowrap">
              <Anchor
                component="button"
                type="button"
                variant="rowAction"
                onClick={() => {
                  setEditingId(row.id);
                  form.setValues({ kind: row.kind, text: row.text, lang: row.lang, translation: row.translation });
                }}
              >
                {t('localize.ruleEdit')}
              </Anchor>
              <Anchor component="button" type="button" variant="rowAction" onClick={() => confirmDelete(row)}>
                {t('localize.ruleDelete')}
              </Anchor>
            </Group>
          )}
          actionsLabel={t('localize.columns.actions')}
        />
      </Stack>
    </Modal>
  );
}
