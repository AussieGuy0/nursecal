import { SharedCalendar } from '../types';

interface CalendarSwitcherProps {
  sharedCalendars: SharedCalendar[];
  selectedEmail: string | null;
  onSelect: (email: string | null) => void;
}

export function CalendarSwitcher({ sharedCalendars, selectedEmail, onSelect }: CalendarSwitcherProps) {
  if (sharedCalendars.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 overflow-x-auto">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
          selectedEmail === null
            ? 'bg-blue-500 text-white'
            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
        }`}
      >
        My Calendar
      </button>
      {sharedCalendars.map((cal) => (
        <button
          key={cal.email}
          onClick={() => onSelect(cal.email)}
          className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
            selectedEmail === cal.email
              ? 'bg-blue-500 text-white'
              : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
          }`}
        >
          {cal.email}
        </button>
      ))}
    </div>
  );
}
