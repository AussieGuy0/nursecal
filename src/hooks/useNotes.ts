import { useState, useEffect, useCallback, useRef } from 'react';
import { NoteMap } from '../types';
import { apiFetch } from '../utils/api';

export function useNotes(authenticated: boolean, onSaveError?: (error: string) => void) {
  const [notes, setNotes] = useState<NoteMap>({});
  const [loading, setLoading] = useState(true);
  const confirmedNotes = useRef<NoteMap>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveVersions = useRef(new Map<string, number>());

  const fetchNotes = useCallback(async () => {
    if (!authenticated) {
      setNotes({});
      confirmedNotes.current = {};
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch('/api/notes');
      if (res.ok) {
        const data: NoteMap = await res.json();
        confirmedNotes.current = data;
        setNotes(data);
      }
    } catch {
      onSaveError?.('Could not load notes');
    } finally {
      setLoading(false);
    }
  }, [authenticated, onSaveError]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const saveNote = useCallback(
    (date: string, value: string) => {
      const trimmed = value.trim();
      const version = (saveVersions.current.get(date) ?? 0) + 1;
      saveVersions.current.set(date, version);

      setNotes((current) => {
        const next = { ...current };
        if (trimmed) next[date] = value;
        else delete next[date];
        return next;
      });

      const existingTimer = timers.current.get(date);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(async () => {
        timers.current.delete(date);
        try {
          const res = await apiFetch(`/api/notes/${date}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: trimmed }),
          });
          if (!res.ok) throw new Error('Failed to save note');

          if (saveVersions.current.get(date) === version) {
            const next = { ...confirmedNotes.current };
            if (trimmed) next[date] = trimmed;
            else delete next[date];
            confirmedNotes.current = next;
            setNotes((current) => {
              const updated = { ...current };
              if (trimmed) updated[date] = trimmed;
              else delete updated[date];
              return updated;
            });
          }
        } catch {
          if (saveVersions.current.get(date) === version) {
            const previous = confirmedNotes.current[date];
            setNotes((current) => {
              const next = { ...current };
              if (previous === undefined) delete next[date];
              else next[date] = previous;
              return next;
            });
            onSaveError?.('Note could not be saved');
          }
        }
      }, 600);
      timers.current.set(date, timer);
    },
    [onSaveError],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  return { notes, loading, saveNote, refetch: fetchNotes };
}
