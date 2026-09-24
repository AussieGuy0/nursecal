import { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftMap } from '../types';
import { apiFetch } from '../utils/api';

type ShiftChanges = Record<string, string | null>;

function applyChanges(shifts: ShiftMap, changes: ShiftChanges): ShiftMap {
  const next = { ...shifts };
  for (const [date, labelId] of Object.entries(changes)) {
    if (labelId === null) delete next[date];
    else next[date] = labelId;
  }
  return next;
}

export function useShifts(authenticated: boolean, onSyncError?: (error: string) => void) {
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [loading, setLoading] = useState(true);
  const pendingSync = useRef<ShiftChanges>({});
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlight = useRef(false);
  const session = useRef(0);
  const lastSyncedShifts = useRef<ShiftMap>({});

  // Fetch shifts from API
  const fetchShifts = useCallback(async () => {
    if (!authenticated) {
      session.current++;
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      syncTimeout.current = null;
      pendingSync.current = {};
      setShifts({});
      lastSyncedShifts.current = {};
      setLoading(false);
      return;
    }

    const currentSession = session.current;
    try {
      const res = await apiFetch('/api/calendar');
      if (res.ok) {
        const data = await res.json();
        if (currentSession !== session.current) return;
        setShifts(data);
        lastSyncedShifts.current = data;
      }
    } catch {
      console.error('Failed to fetch shifts');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Send one batch at a time so a delayed response cannot overwrite a newer edit.
  const syncToBackend: () => Promise<void> = useCallback(async () => {
    if (syncInFlight.current || Object.keys(pendingSync.current).length === 0) return;
    // Keep each request below the API's per-request limit, even if many edits queued up.
    const changes = Object.fromEntries(Object.entries(pendingSync.current).slice(0, 366)) as ShiftChanges;
    for (const date of Object.keys(changes)) delete pendingSync.current[date];
    syncInFlight.current = true;
    const currentSession = session.current;
    let error: string | null = null;

    try {
      const res = await apiFetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) error = 'Failed to save shifts';
    } catch {
      error = 'Network error — shifts could not be saved';
    } finally {
      syncInFlight.current = false;
      if (currentSession === session.current) {
        if (error) {
          // Only revert dates that have not been edited again while this request ran.
          const superseded = new Set(Object.keys(pendingSync.current));
          setShifts((current) => {
            const rollback: ShiftChanges = {};
            for (const [date, labelId] of Object.entries(changes)) {
              if (
                superseded.has(date) ||
                Object.prototype.hasOwnProperty.call(pendingSync.current, date) ||
                current[date] !== (labelId ?? undefined)
              )
                continue;
              rollback[date] = lastSyncedShifts.current[date] ?? null;
            }
            return applyChanges(current, rollback);
          });
          onSyncError?.(error);
        } else {
          lastSyncedShifts.current = applyChanges(lastSyncedShifts.current, changes);
        }
      }

      if (!syncTimeout.current && Object.keys(pendingSync.current).length > 0) void syncToBackend();
    }
  }, [onSyncError]);

  // Coalesce rapid edits, without resending the rest of the calendar.
  const queueSync = useCallback(
    (date: string, labelId: string | null) => {
      pendingSync.current[date] = labelId;

      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current);
      }

      syncTimeout.current = setTimeout(() => {
        syncTimeout.current = null;
        void syncToBackend();
      }, 500); // Debounce 500ms
    },
    [syncToBackend],
  );

  const setShift = (date: string, labelId: string) => {
    setShifts((prev) => ({ ...prev, [date]: labelId }));
    queueSync(date, labelId);
  };

  const clearShift = (date: string) => {
    setShifts((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
    queueSync(date, null);
  };

  const getShift = (date: string): string | undefined => {
    return shifts[date];
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current);
      }
    };
  }, []);

  return {
    shifts,
    loading,
    setShift,
    clearShift,
    getShift,
    refetch: fetchShifts,
  };
}
