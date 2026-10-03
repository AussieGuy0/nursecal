import { Label } from '../types';
import { NoteSaveStatus } from '../hooks/useNotes';

interface LabelPickerProps {
  labels: Label[];
  currentLabelId?: string;
  onSelect: (labelId: string) => void;
  onClear: () => void;
  onClose: () => void;
  date: string;
  note: string;
  onSaveNote: (note: string) => void;
  noteStatus?: NoteSaveStatus;
  onRetryNote: () => void;
}

export function LabelPicker({
  labels,
  currentLabelId,
  onSelect,
  onClear,
  onClose,
  date,
  note,
  onSaveNote,
  noteStatus,
  onRetryNote,
}: LabelPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl safe-bottom">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{date}</h2>
            <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <h3 className="mb-3 text-sm font-medium text-gray-700">Select Shift</h3>

          {/* Label options */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() => onSelect(label.id)}
                className={`
                  flex flex-col items-center p-3 rounded-xl border-2 transition-all
                  ${
                    currentLabelId === label.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mb-2"
                  style={{ backgroundColor: label.color }}
                >
                  {label.shortCode}
                </span>
                <span className="text-xs text-gray-600 text-center">{label.name}</span>
              </button>
            ))}
          </div>

          {currentLabelId && (
            <button
              onClick={onClear}
              className="w-full mb-4 py-3 text-red-600 font-medium rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
            >
              Clear Shift
            </button>
          )}

          <div className="mb-4">
            <span className="mb-1 flex items-center justify-between">
              <label htmlFor="date-note" className="text-sm font-medium text-gray-700">
                Note
              </label>
              {note && (
                <button
                  type="button"
                  onClick={() => onSaveNote('')}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Clear note
                </button>
              )}
            </span>
            <textarea
              id="date-note"
              value={note}
              onChange={(event) => onSaveNote(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Add a note for this date"
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div role="status" className="mt-1 text-xs text-gray-600">
              {noteStatus === 'saving' && 'Saving…'}
              {noteStatus === 'saved' && 'Saved'}
              {(noteStatus === 'error' || noteStatus === 'conflict') && (
                <>
                  {noteStatus === 'conflict'
                    ? 'Changed elsewhere. Retry to replace it with your draft.'
                    : 'Not saved. Your draft is kept.'}
                  <button type="button" onClick={onRetryNote} className="ml-2 text-blue-600 underline">
                    Retry
                  </button>
                </>
              )}
            </div>
            <span className="block mt-1 text-right text-xs text-gray-500">{note.length}/1000</span>
          </div>
        </div>
      </div>
    </div>
  );
}
