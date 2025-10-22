import { useRef, useCallback } from "react";

type OnEvent = (event: { type: 'status' | 'progress' | 'complete' | 'error' | 'aborted'; payload?: any }) => void;

export function useVideoGenerator({ fetchFn = fetch }: { fetchFn?: typeof fetch | ((...args:any[]) => Promise<any>) } = {}) {
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  const generate = useCallback(async (prompt: string, onEvent?: OnEvent) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      onEvent?.({ type: 'status', payload: 'initiating' });
      const res = await fetchFn('/api/videos/generate', { method: 'POST', signal: controller.signal, body: JSON.stringify({ prompt }) });
      if (!res.ok) {
        const txt = await (res.text ? res.text() : Promise.resolve('error'));
        onEvent?.({ type: 'error', payload: txt });
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        onEvent?.({ type: 'error', payload: 'No readable body' });
        return;
      }

      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) { done = true; break; }
        const chunk = decoder.decode(value);
        // SSE / NDJSON may include multiple lines; split by newline and handle lines starting with 'data: '
        const lines = chunk.split(/\r?\n/);
        for (const line of lines) {
          if (!line) continue;
          if (line.startsWith('data:')) {
            try {
              const payload = JSON.parse(line.replace(/^data:\s*/, ''));
              if (payload.status) onEvent?.({ type: 'status', payload: payload.status });
              if (typeof payload.progress === 'number') onEvent?.({ type: 'progress', payload: payload.progress });
              if (payload.status === 'complete' && payload.video) {
                onEvent?.({ type: 'complete', payload: payload.video });
              }
              if (payload.status === 'error') {
                onEvent?.({ type: 'error', payload: payload.error || 'generation error' });
              }
            } catch (e) {
              // try to recover: emit raw chunk if parse fails
              onEvent?.({ type: 'error', payload: `parse_error:${(e as Error).message}` });
            }
          } else {
            // ignore other SSE control lines
          }
        }
      }

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        onEvent?.({ type: 'aborted' });
      } else {
        onEvent?.({ type: 'error', payload: err?.message || 'unknown' });
      }
    } finally {
      controllerRef.current = null;
    }
  }, [fetchFn]);

  return { generate, abort };
}