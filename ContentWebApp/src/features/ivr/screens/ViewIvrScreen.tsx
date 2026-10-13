import { Breadcrumbs, List, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { LoadError } from '@shared/components/LoadError';
import { toApiState } from '@shared/utils/apiState';
import { getIvrStructure, type Fsm } from '../api/ivr';

function IvrStructure({ fsm }: { fsm: Fsm }) {
  const { t } = useTranslation();
  const optionKey = (key: string | number) => {
    if (String(key) === '0') return t('ivr.emptyOption');
    return key;
  };

  return (
    <Stack gap="md">
      {fsm.states.map((state) => (
        <Paper key={state.id} p="md" radius="md">
          <Text fw={700}>{state.menu.description || state.id}</Text>
          {state.menu.options.map((opt) => (
            <Text key={opt.key} size="sm" c="dimmed">
              {optionKey(opt.key)}: {opt.value}
            </Text>
          ))}
          <List size="sm">
            {fsm.transitions
              .filter((tr) => tr.source_state_id === state.id)
              .map((tr) => (
                <List.Item key={`${tr.source_state_id}-${tr.dest_state_id}-${tr.input}`}>
                  {t('ivr.transition', { input: tr.input, dest: tr.dest_state_id })}
                </List.Item>
              ))}
          </List>
        </Paper>
      ))}
    </Stack>
  );
}

export function ViewIvrScreen() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const fsm = useQuery({
    queryKey: ['ivr', 'structure'],
    queryFn: getIvrStructure,
    enabled: status === 'authenticated',
  });
  const fsmState = toApiState(fsm);

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{t('ivr.viewTitle')}</Text>
      </Breadcrumbs>
      <Title order={2}>{t('ivr.viewTitle')}</Title>
      {fsmState.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {fsmState.status === 'error' && <LoadError error={fsmState.error} />}
      {fsmState.status === 'done' && <IvrStructure fsm={fsmState.data} />}
    </Stack>
  );
}
