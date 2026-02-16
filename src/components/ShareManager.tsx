import { useState } from 'react';
import { Share, ActionResult } from '../types';
import { useToast } from '../context/ToastContext';

interface ShareManagerProps {
  shares: Share[];
  onAdd: (email: string) => Promise<ActionResult>;
  onRemove: (id: string) => Promise<ActionResult>;
  onClose: () => void;
}

export function ShareManager({ shares, onAdd, onRemove, onClose }: ShareManagerProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    const result = await onAdd(email.trim().toLowerCase());
    setSubmitting(false);

    if (result.success) {
      setEmail('');
      addToast('Calendar shared successfully', 'success');
    } else {
      addToast(result.error!, 'error');
    }
  };

  const handleRemove = async (share: Share) => {
    const result = await onRemove(share.id);
    if (!result.success) {
      addToast(result.error!, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share Calendar</h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-gray-600 mb-4">
            Invite other NurseCal users to view your calendar. They can see your shifts but cannot edit them.
          </p>

          <form onSubmit={handleAdd} className="flex gap-2 mb-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@email.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!email.trim() || submitting}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              Share
            </button>
          </form>

          {shares.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Shared with</h3>
              <div className="space-y-2">
                {shares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                    <span className="text-sm text-gray-700 truncate">{share.email}</span>
                    <button
                      onClick={() => handleRemove(share)}
                      className="p-1.5 rounded-full hover:bg-red-100 text-red-600 shrink-0"
                      aria-label={`Remove ${share.email}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
