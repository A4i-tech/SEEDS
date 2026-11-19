import { Anchor, Button, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { DownloadMenu } from '@shared/components/DownloadMenu';
import { RowActions } from '@shared/components/RowActions';
import { useRole } from '@features/auth/store/useAuthStore';
import { useDeleteRemediationJob } from '../hooks/useJobs';
import { JOB_ACTION, flowRoute, type JobRow } from '../types/job.types';
import { availableDownloads } from '../utils/artifacts';
import { AssignVolunteerModal } from './AssignVolunteerModal';

export function JobRowAction({ row }: { row: JobRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const go = () => {
    if (row.type === 'make-accessible' && (row.status === 'needs-review' || row.status === 'done')) {
      return navigate({ to: '/review/remediate/$jobId', params: { jobId: row.id } });
    }
    if (row.type === 'make-accessible') return navigate({ to: '/make-accessible/$jobId', params: { jobId: row.id } });
    if (row.type === 'course-sync') return navigate({ to: '/jobs/$jobId', params: { jobId: row.id } });
    return navigate({ to: flowRoute[row.type] });
  };
  const role = useRole();
  const [assigning, { open: openAssign, close: closeAssign }] = useDisclosure();
  const remove = useDeleteRemediationJob();
  const confirmRemove = () =>
    openConfirmDialog({
      title: t('jobs.deleteTitle'),
      body: t('jobs.deleteBody'),
      confirmLabel: t('jobs.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => remove.mutate(row.id),
    });
  const action = JOB_ACTION[row.status];
  const emphasised = row.status === 'failed' || row.status === 'needs-review';
  return (
    <Group gap="sm" wrap="nowrap">
      {emphasised && (
        <Button variant="outline" size="compact-md" onClick={() => void go()}>
          {t(action.labelKey)}
        </Button>
      )}
      <RowActions>
        {!emphasised && (
          <Anchor component="button" type="button" variant="rowAction" onClick={() => void go()}>
            {t(action.labelKey)}
          </Anchor>
        )}
        {row.remediation && availableDownloads(row.remediation.artifacts).length > 0 && (
          <DownloadMenu job={row.remediation} row />
        )}
        {row.remediation && role === 'tenant' && (
          <Anchor component="button" type="button" variant="rowAction" onClick={openAssign}>
            {t('jobs.assign')}
          </Anchor>
        )}
        {row.type === 'make-accessible' && role === 'tenant' && (
          <Anchor component="button" type="button" variant="rowAction" c="red" onClick={confirmRemove}>
            {t('jobs.delete')}
          </Anchor>
        )}
      </RowActions>
      {assigning && row.remediation && <AssignVolunteerModal job={row.remediation} onClose={closeAssign} />}
    </Group>
  );
}
