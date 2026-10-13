import { z } from 'zod';

const eventSchema = z.object({ job: z.unknown() });

export async function streamJob<T extends z.ZodType>(
  url: string,
  headers: Record<string, string>,
  jobSchema: T,
  onJob: (job: z.infer<T>) => void,
  signal: AbortSignal,
): Promise<void> {
  try {
    const response = await fetch(url, { headers, signal });
    if (!response.ok || !response.body) {
      throw new Error(`Stream failed with status ${response.status}`);
    }
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
        onJob(jobSchema.parse(job));
      }
    }
  } catch (err) {
    if (!signal.aborted) throw err;
  }
}
