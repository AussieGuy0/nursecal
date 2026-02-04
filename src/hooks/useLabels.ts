import { useState, useEffect, useCallback } from 'react';
import { Label, ActionResult } from '../types';

export function useLabels(authenticated: boolean) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch labels from API
  const fetchLabels = useCallback(async () => {
    if (!authenticated) {
      setLabels([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/labels');
      if (res.ok) {
        const data = await res.json();
        setLabels(data);
      }
    } catch {
      console.error('Failed to fetch labels');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const addLabel = async (shortCode: string, name: string, color: string): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortCode, name, color }),
      });
      if (res.ok) {
        const newLabel = await res.json();
        setLabels((prev) => [...prev, newLabel]);
        return { success: true };
      }
      const body = await res.json().catch(() => null);
      return { success: false, error: body?.error || 'Failed to add label' };
    } catch {
      return { success: false, error: 'Network error — could not add label' };
    }
  };

  const updateLabel = async (id: string, updates: Partial<Omit<Label, 'id'>>): Promise<ActionResult> => {
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedLabel = await res.json();
        setLabels((prev) => prev.map((label) => (label.id === id ? updatedLabel : label)));
        return { success: true };
      }
      const body = await res.json().catch(() => null);
      return { success: false, error: body?.error || 'Failed to update label' };
    } catch {
      return { success: false, error: 'Network error — could not update label' };
    }
  };

  const deleteLabel = async (id: string): Promise<ActionResult> => {
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLabels((prev) => prev.filter((label) => label.id !== id));
        return { success: true };
      }
      const body = await res.json().catch(() => null);
      return { success: false, error: body?.error || 'Failed to delete label' };
    } catch {
      return { success: false, error: 'Network error — could not delete label' };
    }
  };

  const getLabelById = (id: string): Label | undefined => {
    return labels.find((label) => label.id === id);
  };

  return {
    labels,
    loading,
    addLabel,
    updateLabel,
    deleteLabel,
    getLabelById,
    refetch: fetchLabels,
  };
}
