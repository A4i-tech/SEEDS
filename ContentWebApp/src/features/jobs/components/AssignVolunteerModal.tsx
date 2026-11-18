import { Select, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormModal } from '@features/registration/components/FormModal';
import { LoadError } from '@shared/components/LoadError';
import { useVolunteers } from '@features/registration/hooks/useVolunteers';
import { selectValue } from '@shared/utils/select';
import { useAssignRemediationJob } from '../hooks/useJobs';
import type { RemediationJob } from '../types/job.types';

export function AssignVolunteerModal({ job, onClose }: { job: RemediationJob; onClose: () => void }) {
  const { t } = useTranslation();
  const { state: volunteerState, volunteers, reload } = useVolunteers();
  const [volunteerId, setVolunteerId] = useState(job.assigned_to);
  const assign = useAssignRemediationJob();

  return (
    <FormModal
      title={t('jobs.assignTitle', { name: job.source_name })}
      submitLabel={t('jobs.assign')}
      submitDisabled={!volunteerId || volunteerState.status !== 'done'}
      errorMessage={assign.error && assign.error.message}
      isPending={assign.isPending}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        assign.mutate({ jobId: job.job_id, volunteerId, force: Boolean(job.assigned_to) }, { onSuccess: onClose });
      }}
    >
      {volunteerState.status === 'loading' && <Text size="sm" c="dimmed">{t('common.loading')}</Text>}
      {volunteerState.status === 'error' && <LoadError error={volunteerState.error} onRetry={reload} />}
      <Select
        label={t('jobs.volunteer')}
        data={volunteers.map((v) => ({ value: v.id, label: `${v.name} (${v.email})` }))}
        value={volunteerId}
        onChange={(value) => setVolunteerId(selectValue(value, ''))}
        searchable
        disabled={volunteerState.status !== 'done'}
        nothingFoundMessage={t('jobs.noVolunteers')}
      />
    </FormModal>
  );
}
