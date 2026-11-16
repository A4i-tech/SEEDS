import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, setTokenGetter } from '@shared/services/apiClient';
import { streamJob } from '@shared/services/sse';

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }));

const fetchMock = vi.fn();
const onJob = vi.fn();
const jobSchema = z.object({ status: z.string() });
const isDone = (job: z.infer<typeof jobSchema>) => job.status === 'done';

function frame(event: 'progress' | 'done', status: string) {
  return `event: ${event}\ndata: ${JSON.stringify({ event, job: { status } })}\n\n`;
}

function run(isTerminal = isDone, signal = new AbortController().signal) {
  return streamJob('http://test-api/stream', {}, jobSchema, onJob, isTerminal, signal);
}

describe('streamJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    setTokenGetter(() => '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves after a terminal frame and reports each job once', async () => {
    fetchMock.mockResolvedValue(new Response(frame('progress', 'running') + frame('done', 'done')));
    await expect(run()).resolves.toBeUndefined();
    expect(onJob).toHaveBeenCalledTimes(2);
    expect(onJob).toHaveBeenLastCalledWith({ status: 'done' });
  });

  it('rejects when the stream closes before a terminal frame', async () => {
    fetchMock.mockResolvedValue(new Response(frame('progress', 'running')));
    await expect(run()).rejects.toThrow('Stream closed before the job finished');
    expect(onJob).toHaveBeenCalledWith({ status: 'running' });
  });

  it('rejects on an empty body', async () => {
    fetchMock.mockResolvedValue(new Response(''));
    await expect(run()).rejects.toThrow('Stream closed before the job finished');
    expect(onJob).not.toHaveBeenCalled();
  });

  it('resolves on a terminal frame without waiting for the connection to close', async () => {
    const open = new ReadableStream<Uint8Array>({
      start: (controller) => controller.enqueue(new TextEncoder().encode(frame('progress', 'in_review'))),
    });
    fetchMock.mockResolvedValue(new Response(open));
    await expect(run((job) => job.status === 'in_review')).resolves.toBeUndefined();
  });

  it('rejects with ApiError on 401', async () => {
    setTokenGetter(() => 't');
    fetchMock.mockResolvedValue(new Response('expired', { status: 401 }));
    await expect(run()).rejects.toMatchObject({ status: 401 });
  });

  it('rejects with ApiError on other failures', async () => {
    setTokenGetter(() => 't');
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(run()).rejects.toBeInstanceOf(ApiError);
  });

  it('resolves quietly when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockResolvedValue(new Response(''));
    await expect(run(isDone, controller.signal)).resolves.toBeUndefined();
  });
});
