import { z } from 'zod';
import { rejectResponse } from './apiClient';

const eventSchema = z.object({ event: z.enum(['progress', 'done']), job: z.json() });

export async function streamJob<T extends z.ZodType>(
  url: string,
  headers: Record<string, string>,
  jobSchema: T,
  onJob: (job: z.infer<T>) => void,
  isTerminal: (job: z.infer<T>) => boolean,
  signal: AbortSignal,
): Promise<void> {
  try {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) await rejectResponse(url, response);
    if (!response.body) throw new Error(`Stream failed with status ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      [buffer] = frames.splice(-1);
      for (const frame of frames) {
        const lines = frame.split('\n').filter((line) => line.startsWith('data:'));
        if (lines.length === 0) continue;
        const { job } = eventSchema.parse(JSON.parse(lines.map((line) => line.slice(5).trim()).join('\n')));
        const parsed = jobSchema.parse(job);
        onJob(parsed);
        if (isTerminal(parsed)) {
          await reader.cancel();
          return;
        }
      }
    }
    throw new Error('Stream closed before the job finished');
  } catch (err) {
    if (!signal.aborted) throw err;
  }
}
