import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';

interface AuthState {
  authenticated: boolean;
  email: string | null;
  loading: boolean;
}

// Absolute ceiling on the opening auth check. apiFetch already bounds each
// attempt, but a PWA resumed from a frozen background can be left holding a
// fetch that never settles alongside timers that never fire. Without an
// independent escape hatch the app sits on "Loading..." forever.
const AUTH_WATCHDOG_MS = 15_000;

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    authenticated: false,
    email: null,
    loading: true,
  });

  const checkAuth = useCallback(async (isInitial = false) => {
    try {
      // Retried: the opening request can be dropped by a service worker that is
      // activating and claiming the page, in which case it never reaches the
      // server and only a second attempt gets an answer.
      const res = await apiFetch('/api/auth/me', undefined, {
        retries: 2,
        timeoutMs: [3_000, 6_000, 10_000],
      });
      const data = await res.json();
      setAuthState({
        authenticated: data.authenticated,
        email: data.email || null,
        loading: false,
      });
    } catch {
      // A failed re-check means the network blipped, not that the session
      // ended — dropping the user back to the login form there would log them
      // out every time they reopened the app offline. Only the opening check
      // may conclude "signed out" from a failure, since it has nothing to show
      // otherwise.
      setAuthState((prev) =>
        isInitial ? { authenticated: false, email: null, loading: false } : { ...prev, loading: false },
      );
    }
  }, []);

  useEffect(() => {
    checkAuth(true);

    const watchdog = setTimeout(() => {
      setAuthState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
    }, AUTH_WATCHDOG_MS);

    return () => clearTimeout(watchdog);
  }, [checkAuth]);

  // Re-check when the app returns to the foreground. A backgrounded PWA can be
  // frozen mid-request, and on resume that request may never settle, so asking
  // again is the only way to recover without the user reloading by hand.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') {
        checkAuth();
      }
    };

    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('pageshow', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('pageshow', recheck);
    };
  }, [checkAuth]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      setAuthState({
        authenticated: true,
        email: data.email,
        loading: false,
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const registerInitiate = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiFetch('/api/auth/register/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Registration failed' };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const registerVerify = async (email: string, code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiFetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Verification failed' };
      }

      setAuthState({
        authenticated: true,
        email: data.email,
        loading: false,
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors
    }
    setAuthState({
      authenticated: false,
      email: null,
      loading: false,
    });
  };

  return {
    ...authState,
    login,
    registerInitiate,
    registerVerify,
    logout,
  };
}
