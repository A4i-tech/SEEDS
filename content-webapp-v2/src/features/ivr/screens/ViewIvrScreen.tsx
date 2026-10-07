import { Breadcrumbs, List, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getIvrStructure } from '../api/ivr';
import classes from './ViewIvrScreen.module.css';

export function ViewIvrScreen() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const fsm = useQuery({
    queryKey: ['ivr', 'structure'],
    queryFn: getIvrStructure,
    enabled: status === 'authenticated',
  });
  const loadError = toApiErrorMessage(fsm.error);
  const transitions = fsm.data?.transitions ?? [];

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{t('ivr.viewTitle')}</Text>
      </Breadcrumbs>
      <Title order={2}>{t('ivr.viewTitle')}</Title>
      {fsm.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {fsm.data && (
        <Stack gap="md">
          {(fsm.data.states ?? []).map((state) => (
            <Stack key={state.id} gap={0} className={classes.state}>
              <Text fw={700}>{state.menu?.description ?? state.id}</Text>
              {(state.menu?.options ?? []).map((opt) => (
                <Text key={opt.key} size="sm" c="dimmed">
                  {String(opt.key) === '0' ? t('ivr.emptyOption') : opt.key}: {opt.value ?? ''}
                </Text>
              ))}
              <List size="sm">
                {transitions
                  .filter((tr) => tr.source_state_id === state.id)
                  .map((tr) => (
                    <List.Item key={`${tr.source_state_id}-${tr.dest_state_id}-${tr.input ?? ''}`}>
                      {t('ivr.transition', { input: tr.input ?? '', dest: tr.dest_state_id })}
                    </List.Item>
                  ))}
              </List>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
