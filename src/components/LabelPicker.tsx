import { Label } from '../types';

interface LabelPickerProps {
  labels: Label[];
  currentLabelId?: string;
  onSelect: (labelId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function LabelPicker({ labels, currentLabelId, onSelect, onClear, onClose }: LabelPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl safe-bottom">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Select Shift</h2>
            <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

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

          {/* Clear button */}
          {currentLabelId && (
            <button
              onClick={onClear}
              className="w-full py-3 text-red-600 font-medium rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
            >
              Clear Shift
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
