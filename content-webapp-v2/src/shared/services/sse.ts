export interface StreamHandlers {
  onEvent: (data: unknown) => void;
  signal?: AbortSignal;
}

export async function streamEvents(url: string, headers: Record<string, string>, { onEvent, signal }: StreamHandlers): Promise<void> {
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
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const lines = frame.split('\n').filter((line) => line.startsWith('data:'));
      if (lines.length === 0) continue;
      try {
        onEvent(JSON.parse(lines.map((line) => line.slice(5).trim()).join('\n')));
      } catch {
        continue;
      }
    }
  }
}
