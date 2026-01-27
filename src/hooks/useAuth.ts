import { useState, useEffect, useCallback } from 'react';

interface AuthState {
  authenticated: boolean;
  email: string | null;
  loading: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    authenticated: false,
    email: null,
    loading: true,
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setAuthState({
        authenticated: data.authenticated,
        email: data.email || null,
        loading: false,
      });
    } catch {
      setAuthState({
        authenticated: false,
        email: null,
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
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

  const register = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Registration failed' };
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
      await fetch('/api/auth/logout', { method: 'POST' });
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
    register,
    logout,
  };
}
