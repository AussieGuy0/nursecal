import { useState, useEffect, useCallback, useRef } from 'react';
import { ShiftMap } from '../types';

export function useShifts(authenticated: boolean, currentMonth: string, onSyncError?: (error: string) => void) {
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [loading, setLoading] = useState(true);
  const pendingSync = useRef<{ shifts: ShiftMap; month: string } | null>(null);
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedShifts = useRef<ShiftMap>({});
  const fetchedMonths = useRef<Set<string>>(new Set());

  const fetchMonth = useCallback(
    async (month: string) => {
      if (!authenticated) return;
      try {
        const res = await fetch(`/api/calendar?month=${month}`);
        if (res.ok) {
          const data = await res.json();
          setShifts((prev) => {
            const next = { ...prev, ...data };
            lastSyncedShifts.current = { ...lastSyncedShifts.current, ...data };
            return next;
          });
          fetchedMonths.current.add(month);
        }
      } catch {
        console.error('Failed to fetch shifts for month', month);
      } finally {
        setLoading(false);
      }
    },
    [authenticated],
  );

  useEffect(() => {
    if (!authenticated) {
      setShifts({});
      lastSyncedShifts.current = {};
      fetchedMonths.current.clear();
      setLoading(false);
      return;
    }
    fetchMonth(currentMonth);
  }, [authenticated, currentMonth, fetchMonth]);

  const syncToBackend = useCallback(
    async (allShifts: ShiftMap, month: string) => {
      const monthShifts = Object.fromEntries(
        Object.entries(allShifts).filter(([date]) => date.startsWith(`${month}-`)),
      );
      try {
        const res = await fetch(`/api/calendar?month=${month}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(monthShifts),
        });
        if (res.ok) {
          const updated = { ...lastSyncedShifts.current };
          Object.keys(updated).forEach((d) => {
            if (d.startsWith(`${month}-`)) delete updated[d];
          });
          lastSyncedShifts.current = { ...updated, ...monthShifts };
        } else {
          setShifts({ ...lastSyncedShifts.current });
          onSyncError?.('Failed to save shifts');
        }
      } catch {
        setShifts({ ...lastSyncedShifts.current });
        onSyncError?.('Network error — shifts could not be saved');
      }
    },
    [onSyncError],
  );

  const queueSync = useCallback(
    (newShifts: ShiftMap, month: string) => {
      pendingSync.current = { shifts: newShifts, month };

      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current);
      }

      syncTimeout.current = setTimeout(() => {
        if (pendingSync.current) {
          syncToBackend(pendingSync.current.shifts, pendingSync.current.month);
          pendingSync.current = null;
        }
      }, 500);
    },
    [syncToBackend],
  );

  const setShift = (date: string, labelId: string) => {
    setShifts((prev) => {
      const next = { ...prev, [date]: labelId };
      queueSync(next, currentMonth);
      return next;
    });
  };

  const clearShift = (date: string) => {
    setShifts((prev) => {
      const next = { ...prev };
      delete next[date];
      queueSync(next, currentMonth);
      return next;
    });
  };

  const getShift = (date: string): string | undefined => {
    return shifts[date];
  };

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
    refetch: () => fetchMonth(currentMonth),
  };
}
