import { useCallback, useState } from 'react';

export type TimelineKind = 'status' | 'scenario';

export interface TimelineEvent {
  id: number;
  at: number;
  kind: TimelineKind;
  label: string;
  detail?: string;
}

const MAX_EVENTS = 100;
let nextId = 1;

// In memory only: the timeline describes this console session.
export function useTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const add = useCallback((kind: TimelineKind, label: string, detail?: string) => {
    setEvents((list) => [{ id: nextId++, at: Date.now(), kind, label, detail }, ...list].slice(0, MAX_EVENTS));
  }, []);
  return { events, add };
}
