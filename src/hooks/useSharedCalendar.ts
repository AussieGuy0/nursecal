import { useState, useEffect, useCallback } from 'react';
import { SharedCalendarData } from '../types';

export function useSharedCalendar(ownerEmail: string | null) {
  const [data, setData] = useState<SharedCalendarData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!ownerEmail) {
      setData(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/shared-calendars/${encodeURIComponent(ownerEmail)}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      console.error('Failed to fetch shared calendar');
    } finally {
      setLoading(false);
    }
  }, [ownerEmail]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { data, loading, refetch: fetch_ };
}
