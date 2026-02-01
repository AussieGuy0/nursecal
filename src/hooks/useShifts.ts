import { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftMap } from '../types';

export function useShifts(authenticated: boolean, onSyncError?: (error: string) => void) {
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [loading, setLoading] = useState(true);
  const pendingSync = useRef<ShiftMap | null>(null);
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedShifts = useRef<ShiftMap>({});

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

  // Debounced sync to backend
  const syncToBackend = useCallback(async (newShifts: ShiftMap) => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newShifts),
      });
      if (res.ok) {
        lastSyncedShifts.current = newShifts;
      } else {
        setShifts(lastSyncedShifts.current);
        onSyncError?.('Failed to save shifts');
      }
    } catch {
      setShifts(lastSyncedShifts.current);
      onSyncError?.('Network error — shifts could not be saved');
    }
  }, [onSyncError]);

  // Queue sync with debouncing
  const queueSync = useCallback((newShifts: ShiftMap) => {
    pendingSync.current = newShifts;

    if (syncTimeout.current) {
      clearTimeout(syncTimeout.current);
    }

    syncTimeout.current = setTimeout(() => {
      if (pendingSync.current) {
        syncToBackend(pendingSync.current);
        pendingSync.current = null;
      }
    }, 500); // Debounce 500ms
  }, [syncToBackend]);

  const setShift = (date: string, labelId: string) => {
    setShifts(prev => {
      const next = { ...prev, [date]: labelId };
      queueSync(next);
      return next;
    });
  };

  const clearShift = (date: string) => {
    setShifts(prev => {
      const next = { ...prev };
      delete next[date];
      queueSync(next);
      return next;
    });
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
