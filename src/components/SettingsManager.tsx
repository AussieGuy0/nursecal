import { useState } from 'react';
import { Label, ActionResult } from '../types';
import { useToast } from '../context/ToastContext';

interface SettingsManagerProps {
  labels: Label[];
  onAdd: (shortCode: string, name: string, color: string) => Promise<ActionResult>;
  onUpdate: (id: string, updates: Partial<Omit<Label, 'id'>>) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  onClose: () => void;
  googleConnected?: boolean;
  googleVisible?: boolean;
  onGoogleConnect?: () => Promise<ActionResult>;
  onGoogleDisconnect?: () => Promise<ActionResult>;
  onToggleGoogleVisibility?: () => Promise<ActionResult>;
}

const PRESET_COLORS = [
  // Row 1: Reds, oranges, yellows
  '#ef4444', '#dc2626', '#f97316', '#ea580c', '#eab308', '#ca8a04',
  // Row 2: Greens, teals, cyans
  '#22c55e', '#16a34a', '#14b8a6', '#0d9488', '#06b6d4', '#0891b2',
  // Row 3: Blues, indigos, purples
  '#3b82f6', '#2563eb', '#6366f1', '#4f46e5', '#8b5cf6', '#7c3aed',
  // Row 4: Pinks, roses, neutrals
  '#ec4899', '#db2777', '#f43f5e', '#e11d48', '#6b7280', '#374151'
];

export function SettingsManager({
  labels, onAdd, onUpdate, onDelete, onClose,
  googleConnected, googleVisible, onGoogleConnect, onGoogleDisconnect, onToggleGoogleVisibility,
}: SettingsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ shortCode: '', name: '', color: '#3b82f6' });
  const { addToast } = useToast();

  const resetForm = () => {
    setFormData({ shortCode: '', name: '', color: '#3b82f6' });
    setEditingId(null);
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!formData.shortCode || !formData.name) return;

    const result = editingId
      ? await onUpdate(editingId, formData)
      : await onAdd(formData.shortCode, formData.name, formData.color);

    if (result.success) {
      resetForm();
    } else {
      addToast(result.error!, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await onDelete(id);
    if (!result.success) {
      addToast(result.error!, 'error');
    }
  };

  const handleGoogleConnect = async () => {
    const result = await onGoogleConnect!();
    if (!result.success) {
      addToast(result.error!, 'error');
    }
  };

  const handleGoogleDisconnect = async () => {
    const result = await onGoogleDisconnect!();
    if (!result.success) {
      addToast(result.error!, 'error');
    }
  };

  const handleToggleVisibility = async () => {
    const result = await onToggleGoogleVisibility!();
    if (!result.success) {
      addToast(result.error!, 'error');
    }
  };

  const startEdit = (label: Label) => {
    setFormData({ shortCode: label.shortCode, name: label.name, color: label.color });
    setEditingId(label.id);
    setIsAdding(false);
  };

  const startAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const showForm = isAdding || editingId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Label list */}
          {!showForm && <h3 className="text-sm font-semibold text-gray-700 mb-3">Labels</h3>}
          {!showForm && (
            <div className="space-y-2 mb-4">
              {labels.map(label => (
                <div
                  key={label.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"
                >
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.shortCode}
                  </span>
                  <span className="flex-1 font-medium">{label.name}</span>
                  <button
                    onClick={() => startEdit(label)}
                    className="p-2 rounded-full hover:bg-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(label.id)}
                    className="p-2 rounded-full hover:bg-red-100 text-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showForm && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Short Code (1-4 characters)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={formData.shortCode}
                  onChange={e => setFormData(f => ({ ...f, shortCode: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="E"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Early Shift"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormData(f => ({ ...f, color }))}
                      className={`w-8 h-8 rounded-full ${formData.color === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetForm}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.shortCode || !formData.name}
                  className="flex-1 py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingId ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* Add button */}
          {!showForm && (
            <button
              onClick={startAdd}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Label
            </button>
          )}

          {/* Google Calendar section */}
          {!showForm && onGoogleConnect && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Google Calendar</h3>
              <p className="text-xs text-gray-500 mb-3">
                View your Google Calendar events alongside your shifts.
              </p>
              {googleConnected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-800">Connected</span>
                  </div>
                  <button
                    onClick={handleToggleVisibility}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">Show events on calendar</span>
                    <div className={`w-10 h-6 rounded-full relative transition-colors ${googleVisible ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${googleVisible ? 'left-5' : 'left-1'}`} />
                    </div>
                  </button>
                  <button
                    onClick={handleGoogleDisconnect}
                    className="w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
                >
                  Connect Google Calendar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
