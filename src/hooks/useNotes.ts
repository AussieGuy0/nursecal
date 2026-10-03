import { useState, useEffect, useCallback, useRef } from 'react';
import { NoteMap } from '../types';
import { apiFetch } from '../utils/api';

export type NoteSaveStatus = 'saving' | 'saved' | 'error' | 'conflict';

export function useNotes(authenticated: boolean, onSaveError?: (error: string) => void) {
  const [notes, setNotes] = useState<NoteMap>({});
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, NoteSaveStatus>>({});
  const versions = useRef<Record<string, number>>({});
  const drafts = useRef(new Map<string, { value: string; revision: number }>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const active = useRef(new Set<string>());
  const session = useRef(0);
  const conflicts = useRef(new Set<string>());

  const fetchNotes = useCallback(async () => {
    const generation = session.current;
    if (!authenticated) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/notes');
      if (!res.ok) throw new Error('Could not load notes');
      const data: { notes: NoteMap; versions: Record<string, number> } = await res.json();
      if (generation !== session.current) return;
      versions.current = data.versions;
      setNotes(data.notes);
    } catch {
      if (generation === session.current) onSaveError?.('Could not load notes');
    } finally {
      if (generation === session.current) setLoading(false);
    }
  }, [authenticated, onSaveError]);

  useEffect(() => {
    session.current++;
    versions.current = {};
    drafts.current.clear();
    active.current.clear();
    conflicts.current.clear();
    setNotes({});
    setStatuses({});
    setLoading(false);
    fetchNotes();
    return () => {
      session.current++;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, [fetchNotes]);

  const persist = useCallback(
    async (date: string) => {
      if (active.current.has(date)) return;
      const generation = session.current;
      active.current.add(date);
      try {
        while (generation === session.current) {
          const draft = drafts.current.get(date);
          if (!draft) break;
          const res = await apiFetch(`/api/notes/${date}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: draft.value.trim(), version: versions.current[date] ?? 0 }),
          });
          const data: { note: string; version: number } = await res.json();
          if (generation !== session.current) return;
          if (res.status === 409) {
            versions.current[date] = data.version;
            conflicts.current.add(date);
            setStatuses((current) => ({ ...current, [date]: 'conflict' }));
            onSaveError?.('Note changed elsewhere. Your draft is kept; retry to save it.');
            break;
          }
          if (!res.ok) throw new Error('Failed to save note');
          versions.current[date] = data.version;
          if (drafts.current.get(date)?.revision === draft.revision) {
            drafts.current.delete(date);
            setNotes((current) => ({ ...current, [date]: data.note }));
            setStatuses((current) => ({ ...current, [date]: 'saved' }));
            break;
          }
          // A newer draft arrived during the request. Save it using the returned version.
        }
      } catch {
        if (generation === session.current) {
          setStatuses((current) => ({ ...current, [date]: 'error' }));
          onSaveError?.('Note could not be saved. Your draft is kept; retry to save it.');
        }
      } finally {
        if (generation === session.current) active.current.delete(date);
        // Cancel a debounce that became redundant while this request was running.
        if (generation === session.current) {
          const timer = timers.current.get(date);
          if (timer) clearTimeout(timer);
          timers.current.delete(date);
        }
      }
    },
    [onSaveError],
  );

  const saveNote = useCallback(
    (date: string, value: string) => {
      if (!authenticated) return;
      const revision = (drafts.current.get(date)?.revision ?? 0) + 1;
      drafts.current.set(date, { value, revision });
      setNotes((current) => ({ ...current, [date]: value }));
      if (conflicts.current.has(date)) return;
      setStatuses((current) => ({ ...current, [date]: 'saving' }));
      const timer = timers.current.get(date);
      if (timer) clearTimeout(timer);
      timers.current.set(
        date,
        setTimeout(() => {
          timers.current.delete(date);
          void persist(date);
        }, 600),
      );
    },
    [authenticated, persist],
  );

  const retryNote = useCallback(
    (date: string) => {
      if (!authenticated || !drafts.current.has(date)) return;
      conflicts.current.delete(date);
      setStatuses((current) => ({ ...current, [date]: 'saving' }));
      void persist(date);
    },
    [authenticated, persist],
  );

  return { notes, statuses, loading, saveNote, retryNote, refetch: fetchNotes };
}
