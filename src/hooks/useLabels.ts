import { useState, useEffect } from 'react';
import { Label } from '../types';

const STORAGE_KEY = 'nursecal-labels';

const DEFAULT_LABELS: Label[] = [
  { id: '1', shortCode: 'E', name: 'Early Shift', color: '#22c55e' },
  { id: '2', shortCode: 'L', name: 'Late Shift', color: '#3b82f6' },
  { id: '3', shortCode: 'N', name: 'Night Shift', color: '#8b5cf6' },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function useLabels() {
  const [labels, setLabels] = useState<Label[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_LABELS;
      }
    }
    return DEFAULT_LABELS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
  }, [labels]);

  const addLabel = (shortCode: string, name: string, color: string) => {
    const newLabel: Label = {
      id: generateId(),
      shortCode,
      name,
      color
    };
    setLabels(prev => [...prev, newLabel]);
  };

  const updateLabel = (id: string, updates: Partial<Omit<Label, 'id'>>) => {
    setLabels(prev => prev.map(label =>
      label.id === id ? { ...label, ...updates } : label
    ));
  };

  const deleteLabel = (id: string) => {
    setLabels(prev => prev.filter(label => label.id !== id));
  };

  const getLabelById = (id: string): Label | undefined => {
    return labels.find(label => label.id === id);
  };

  return {
    labels,
    addLabel,
    updateLabel,
    deleteLabel,
    getLabelById
  };
}
