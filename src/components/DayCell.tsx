import { Label, GoogleCalendarEvent } from '../types';

interface DayCellProps {
  day: number;
  dateKey: string;
  isCurrentMonth: boolean;
  label?: Label;
  isToday: boolean;
  onTap: (dateKey: string) => void;
  googleEvents?: GoogleCalendarEvent[];
}

export function DayCell({ day, dateKey, isCurrentMonth, label, isToday, onTap, googleEvents }: DayCellProps) {
  const visibleEvents = googleEvents?.slice(0, 2) || [];
  const extraCount = (googleEvents?.length || 0) - 2;

  return (
    <button
      onClick={() => onTap(dateKey)}
      className={`
        relative flex flex-col items-center justify-start p-1 min-h-[3.5rem]
        border-b border-r border-gray-200 transition-colors
        ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}
        hover:bg-gray-100 active:bg-gray-200
      `}
    >
      <span
        className={`
          text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
          ${isToday ? 'bg-blue-500 text-white' : ''}
          ${!isCurrentMonth && !isToday ? 'text-gray-400' : ''}
        `}
      >
        {day}
      </span>

      {label && (
        <span
          className="mt-1 px-2 py-1 text-sm font-bold rounded text-white"
          style={{ backgroundColor: label.color }}
        >
          {label.shortCode}
        </span>
      )}

      {visibleEvents.map((event) => (
        <span
          key={event.id}
          className="mt-0.5 px-1.5 py-0.5 text-[10px] leading-tight font-medium rounded-full truncate max-w-full bg-amber-100 text-amber-800"
        >
          {event.summary}
        </span>
      ))}

      {extraCount > 0 && (
        <span className="text-[10px] text-amber-600 font-medium">
          +{extraCount} more
        </span>
      )}
    </button>
  );
}
