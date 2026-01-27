import { DayCell } from './DayCell';
import { getCalendarDays, formatDateKey } from '../utils/calendar';
import { Label } from '../types';

interface CalendarProps {
  year: number;
  month: number;
  shifts: { [date: string]: string };
  labels: Label[];
  onDayTap: (dateKey: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Calendar({ year, month, shifts, labels, onDayTap }: CalendarProps) {
  const days = getCalendarDays(year, month);
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const getLabelById = (id: string): Label | undefined => {
    return labels.find(l => l.id === id);
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAYS.map(day => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-gray-500 uppercase"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1">
        {days.map(({ day, dateKey, isCurrentMonth }) => (
          <DayCell
            key={dateKey}
            day={day}
            dateKey={dateKey}
            isCurrentMonth={isCurrentMonth}
            isToday={dateKey === todayKey}
            label={shifts[dateKey] ? getLabelById(shifts[dateKey]) : undefined}
            onTap={onDayTap}
          />
        ))}
      </div>
    </div>
  );
}
