import { useEffect, useRef, useState } from 'react';

export interface PollState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean; // true until the first response
  updatedAt: number | undefined;
}

// Calls fn every intervalMs. Never overlaps calls, aborts on unmount and
// pauses while the tab is hidden. Keeps the last good data on error.
export function usePolling<T>(fn: (signal: AbortSignal) => Promise<T>, intervalMs: number): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: undefined, error: undefined, loading: true, updatedAt: undefined });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (document.hidden) {
        timer = setTimeout(tick, intervalMs);
        return;
      }
      try {
        const data = await fnRef.current(controller.signal);
        setState({ data, error: undefined, loading: false, updatedAt: Date.now() });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, error: err as Error, loading: false }));
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, intervalMs);
    };

    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [intervalMs]);

  return state;
}
