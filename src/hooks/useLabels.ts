import { useState, useEffect, useCallback } from 'react';
import { Label } from '../types';

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

  const addLabel = async (shortCode: string, name: string, color: string) => {
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortCode, name, color }),
      });
      if (res.ok) {
        const newLabel = await res.json();
        setLabels(prev => [...prev, newLabel]);
      }
    } catch {
      console.error('Failed to add label');
    }
  };

  const updateLabel = async (id: string, updates: Partial<Omit<Label, 'id'>>) => {
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedLabel = await res.json();
        setLabels(prev => prev.map(label =>
          label.id === id ? updatedLabel : label
        ));
      }
    } catch {
      console.error('Failed to update label');
    }
  };

  const deleteLabel = async (id: string) => {
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLabels(prev => prev.filter(label => label.id !== id));
      }
    } catch {
      console.error('Failed to delete label');
    }
  };

  const getLabelById = (id: string): Label | undefined => {
    return labels.find(label => label.id === id);
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
