import { useState, useEffect, useCallback } from 'react';
import { GoogleCalendarEvent, ActionResult } from '../types';

interface GoogleCalendarState {
  connected: boolean;
  visible: boolean;
  events: GoogleCalendarEvent[];
  loading: boolean;
}

export function useGoogleCalendar(authenticated: boolean, year: number, month: number) {
  const [state, setState] = useState<GoogleCalendarState>({
    connected: false,
    visible: false,
    events: [],
    loading: false,
  });

  const checkStatus = useCallback(async () => {
    if (!authenticated) {
      setState({ connected: false, visible: false, events: [], loading: false });
      return;
    }

    try {
      const res = await fetch('/api/google/status');
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          connected: data.connected,
          visible: data.visible,
        }));
      }
    } catch {
      // ignore
    }
  }, [authenticated]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Fetch events when connected, visible, and month changes
  const fetchEvents = useCallback(async () => {
    if (!authenticated || !state.connected || !state.visible) {
      setState((prev) => ({ ...prev, events: [] }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    const timeMin = new Date(year, month, 1).toISOString();
    const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    try {
      const res = await fetch(`/api/google/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      if (res.ok) {
        const events: GoogleCalendarEvent[] = await res.json();
        setState((prev) => ({ ...prev, events, loading: false }));
      } else {
        if (res.status === 401) {
          setState((prev) => ({ ...prev, connected: false, visible: false, events: [], loading: false }));
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [authenticated, state.connected, state.visible, year, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const connect = useCallback(async (): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/google/auth');
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
        return { success: true };
      }
      return { success: false, error: 'Failed to start Google Calendar connection' };
    } catch {
      return { success: false, error: 'Network error — could not connect to Google Calendar' };
    }
  }, []);

  const disconnect = useCallback(async (): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/google/disconnect', { method: 'POST' });
      if (res.ok) {
        setState({ connected: false, visible: false, events: [], loading: false });
        return { success: true };
      }
      return { success: false, error: 'Failed to disconnect Google Calendar' };
    } catch {
      return { success: false, error: 'Network error — could not disconnect Google Calendar' };
    }
  }, []);

  const toggleVisibility = useCallback(async (): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/google/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({ ...prev, visible: data.visible }));
        return { success: true };
      }
      return { success: false, error: 'Failed to toggle calendar visibility' };
    } catch {
      return { success: false, error: 'Network error — could not toggle calendar visibility' };
    }
  }, []);

  // Group events by date key (YYYY-MM-DD)
  const eventsByDate: Record<string, GoogleCalendarEvent[]> = {};
  for (const event of state.events) {
    const startDate = event.start.split('T')[0];
    if (!eventsByDate[startDate]) {
      eventsByDate[startDate] = [];
    }
    eventsByDate[startDate].push(event);
  }

  return {
    connected: state.connected,
    visible: state.visible,
    events: state.events,
    eventsByDate,
    loading: state.loading,
    connect,
    disconnect,
    toggleVisibility,
    refetchStatus: checkStatus,
  };
}
