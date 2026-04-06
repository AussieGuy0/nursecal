import { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftMap } from '../types';

export function useShifts(authenticated: boolean, onSyncError?: (error: string) => void) {
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [loading, setLoading] = useState(true);
  const lastSyncedShifts = useRef<ShiftMap>({});
  const pendingOps = useRef<Map<string, string | null>>(new Map());
  const syncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Fetch shifts from API
  const fetchShifts = useCallback(async () => {
    if (!authenticated) {
      setShifts({});
      lastSyncedShifts.current = {};
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/calendar');
      if (res.ok) {
        const data = await res.json();
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

  const syncDate = useCallback(
    async (date: string, labelId: string | null) => {
      try {
        const res =
          labelId === null
            ? await fetch(`/api/calendar/${date}`, { method: 'DELETE' })
            : await fetch(`/api/calendar/${date}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labelId }),
              });

        if (res.ok || res.status === 204) {
          if (labelId === null) {
            const next = { ...lastSyncedShifts.current };
            delete next[date];
            lastSyncedShifts.current = next;
          } else {
            lastSyncedShifts.current = { ...lastSyncedShifts.current, [date]: labelId };
          }
        } else {
          revertDate(date);
          onSyncError?.('Failed to save shifts');
        }
      } catch {
        revertDate(date);
        onSyncError?.('Network error — shifts could not be saved');
      }
    },
    [onSyncError],
  );

  const revertDate = (date: string) => {
    setShifts((prev) => {
      const next = { ...prev };
      const synced = lastSyncedShifts.current[date];
      if (synced === undefined) {
        delete next[date];
      } else {
        next[date] = synced;
      }
      return next;
    });
  };

  const queueSync = useCallback(
    (date: string, labelId: string | null) => {
      pendingOps.current.set(date, labelId);

      const existing = syncTimers.current.get(date);
      if (existing) clearTimeout(existing);

      syncTimers.current.set(
        date,
        setTimeout(() => {
          syncTimers.current.delete(date);
          const op = pendingOps.current.get(date);
          if (op !== undefined) {
            pendingOps.current.delete(date);
            syncDate(date, op);
          }
        }, 500),
      );
    },
    [syncDate],
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of syncTimers.current.values()) {
        clearTimeout(timer);
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
