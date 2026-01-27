import { useState, useEffect } from 'react';
import { ShiftMap } from '../types';

const STORAGE_KEY = 'nursecal-shifts';

export function useShifts() {
  const [shifts, setShifts] = useState<ShiftMap>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return {};
      }
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts));
  }, [shifts]);

  const setShift = (date: string, labelId: string) => {
    setShifts(prev => ({ ...prev, [date]: labelId }));
  };

  const clearShift = (date: string) => {
    setShifts(prev => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  };

  const getShift = (date: string): string | undefined => {
    return shifts[date];
  };

  return {
    shifts,
    setShift,
    clearShift,
    getShift
  };
}
