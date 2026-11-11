import type { CallLog } from '../types/analytics.types';

const HEADERS = ['phone_number', 'duration', 'created_at', 'content_id', 'content_name', 'audio_id', 'audio_name'];

const quote = (value: string) => {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function callLogsToCsv(logs: CallLog[]): string {
  const rows = logs.map((log) => [
    log.phone_number,
    String(log.duration),
    log.created_at.toISOString(),
    log.content_id,
    log.content_name,
    log.audio_id,
    log.audio_name,
  ]);
  return [HEADERS, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
