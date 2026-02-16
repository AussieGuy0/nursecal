import { useState, useEffect, useCallback } from 'react';
import { Share, SharedCalendar, ActionResult } from '../types';

export function useShares(authenticated: boolean) {
  const [shares, setShares] = useState<Share[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedCalendar[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShares = useCallback(async () => {
    if (!authenticated) {
      setShares([]);
      setSharedWithMe([]);
      setLoading(false);
      return;
    }

    try {
      const [sharesRes, sharedRes] = await Promise.all([fetch('/api/shares'), fetch('/api/shared-calendars')]);

      if (sharesRes.ok) {
        setShares(await sharesRes.json());
      }
      if (sharedRes.ok) {
        setSharedWithMe(await sharedRes.json());
      }
    } catch {
      console.error('Failed to fetch shares');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const addShare = async (email: string): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        await fetchShares();
        return { success: true };
      }
      const body = await res.json().catch(() => null);
      return { success: false, error: body?.error || 'Failed to share calendar' };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const removeShare = async (id: string): Promise<ActionResult> => {
    try {
      const res = await fetch(`/api/shares/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setShares((prev) => prev.filter((s) => s.id !== id));
        return { success: true };
      }
      const body = await res.json().catch(() => null);
      return { success: false, error: body?.error || 'Failed to remove share' };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  return { shares, sharedWithMe, loading, addShare, removeShare, refetch: fetchShares };
}
