import { Label } from '../types';

interface DayCellProps {
  day: number;
  dateKey: string;
  isCurrentMonth: boolean;
  label?: Label;
  isToday: boolean;
  onTap: (dateKey: string) => void;
}

export function DayCell({ day, dateKey, isCurrentMonth, label, isToday, onTap }: DayCellProps) {
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
    </button>
  );
}
